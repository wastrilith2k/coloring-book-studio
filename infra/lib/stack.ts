import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigwv2Integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as apigwv2Authorizers from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { Construct } from 'constructs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class ColoringBookStudioStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Allowed origins for CORS — restrict to your actual domain in production
    const allowedOrigins = process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',')
      : ['http://localhost:5173', 'https://coloringbookstudio.01webdevelopment.com'];

    // ─── 1. Cognito User Pool ───────────────────────────────────────────

    const userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: 'coloring-book-studio-users',
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const userPoolClient = userPool.addClient('WebClient', {
      userPoolClientName: 'coloring-book-studio-web',
      authFlows: {
        userSrp: true,
        userPassword: true,
      },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
        callbackUrls: allowedOrigins.map(o => `${o}/`),
        logoutUrls: allowedOrigins.map(o => `${o}/`),
      },
      preventUserExistenceErrors: true,
    });

    // ─── 2. S3 Buckets ─────────────────────────────────────────────────

    const imageBucket = new s3.Bucket(this, 'ImageBucket', {
      bucketName: `coloring-book-studio-images-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      cors: [{
        allowedOrigins,
        allowedMethods: [s3.HttpMethods.GET],
        allowedHeaders: ['*'],
      }],
    });

    const frontendBucket = new s3.Bucket(this, 'FrontendBucket', {
      bucketName: `coloring-book-studio-frontend-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // ─── 3. CloudFront ──────────────────────────────────────────────────

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(frontendBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5),
        },
      ],
    });

    // ─── 4. Lambda Functions ────────────────────────────────────────────

    const lambdaDir = path.join(__dirname, '..', '..', 'lambda');

    const httpApiLambda = new lambda.Function(this, 'HttpApiFunction', {
      functionName: 'coloring-book-studio-api',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'api/handler.handler',
      code: lambda.Code.fromAsset(lambdaDir),
      memorySize: 512,
      timeout: cdk.Duration.seconds(30),
      environment: {
        S3_BUCKET_NAME: imageBucket.bucketName,
        ALLOWED_ORIGINS: allowedOrigins.join(','),
        // Secrets loaded from SSM Parameter Store at runtime: /coloring-book-studio/*
      },
    });

    const wsLambda = new lambda.Function(this, 'WebSocketFunction', {
      functionName: 'coloring-book-studio-ws',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'ws/handler.handler',
      code: lambda.Code.fromAsset(lambdaDir),
      memorySize: 512,
      timeout: cdk.Duration.minutes(5),
      environment: {
        S3_BUCKET_NAME: imageBucket.bucketName,
        // Secrets loaded from SSM Parameter Store at runtime: /coloring-book-studio/*
      },
    });

    // WebSocket authorizer Lambda — validates Cognito JWT on $connect
    const wsAuthorizerLambda = new lambda.Function(this, 'WsAuthorizerFunction', {
      functionName: 'coloring-book-studio-ws-auth',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'ws/authorizer.handler',
      code: lambda.Code.fromAsset(lambdaDir),
      memorySize: 128,
      timeout: cdk.Duration.seconds(5),
      environment: {
        USER_POOL_ID: userPool.userPoolId,
        USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
      },
    });

    // Grant S3 permissions
    imageBucket.grantReadWrite(httpApiLambda);
    imageBucket.grantRead(wsLambda);

    // Grant SSM Parameter Store read access for secrets
    const ssmPolicy = new iam.PolicyStatement({
      actions: ['ssm:GetParametersByPath'],
      resources: [`arn:aws:ssm:${this.region}:${this.account}:parameter/coloring-book-studio/*`],
    });
    httpApiLambda.addToRolePolicy(ssmPolicy);
    wsLambda.addToRolePolicy(ssmPolicy);

    // ─── 5. HTTP API Gateway ────────────────────────────────────────────

    const httpApi = new apigwv2.HttpApi(this, 'HttpApi', {
      apiName: 'coloring-book-studio-http',
      corsPreflight: {
        allowHeaders: ['Content-Type', 'Authorization'],
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.PUT,
          apigwv2.CorsHttpMethod.DELETE,
          apigwv2.CorsHttpMethod.OPTIONS,
        ],
        allowOrigins: allowedOrigins,
        maxAge: cdk.Duration.hours(1),
      },
    });

    const jwtAuthorizer = new apigwv2Authorizers.HttpJwtAuthorizer('CognitoAuthorizer', `https://cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}`, {
      jwtAudience: [userPoolClient.userPoolClientId],
    });

    const httpIntegration = new apigwv2Integrations.HttpLambdaIntegration('HttpIntegration', httpApiLambda);

    // /health is intentionally unauthenticated — returns only { status: 'ok' }
    httpApi.addRoutes({
      path: '/health',
      methods: [apigwv2.HttpMethod.GET],
      integration: httpIntegration,
    });

    httpApi.addRoutes({
      path: '/api/{proxy+}',
      methods: [
        apigwv2.HttpMethod.GET,
        apigwv2.HttpMethod.POST,
        apigwv2.HttpMethod.PUT,
        apigwv2.HttpMethod.DELETE,
      ],
      integration: httpIntegration,
      authorizer: jwtAuthorizer,
    });

    // ─── 6. WebSocket API Gateway ───────────────────────────────────────

    // Lambda authorizer for WebSocket $connect — validates Cognito JWT from query string
    const wsAuthorizer = new apigwv2Authorizers.WebSocketLambdaAuthorizer('WsAuthorizer', wsAuthorizerLambda, {
      identitySource: ['route.request.querystring.token'],
    });

    const wsApi = new apigwv2.WebSocketApi(this, 'WebSocketApi', {
      apiName: 'coloring-book-studio-ws',
      connectRouteOptions: {
        integration: new apigwv2Integrations.WebSocketLambdaIntegration('WsConnectIntegration', wsLambda),
        authorizer: wsAuthorizer,
      },
      disconnectRouteOptions: {
        integration: new apigwv2Integrations.WebSocketLambdaIntegration('WsDisconnectIntegration', wsLambda),
      },
      defaultRouteOptions: {
        integration: new apigwv2Integrations.WebSocketLambdaIntegration('WsDefaultIntegration', wsLambda),
      },
    });

    const wsStage = new apigwv2.WebSocketStage(this, 'WebSocketStage', {
      webSocketApi: wsApi,
      stageName: 'prod',
      autoDeploy: true,
    });

    // Add named routes for sendMessage and generateIdeas
    wsApi.addRoute('sendMessage', {
      integration: new apigwv2Integrations.WebSocketLambdaIntegration('WsSendMessageIntegration', wsLambda),
    });

    wsApi.addRoute('generateIdeas', {
      integration: new apigwv2Integrations.WebSocketLambdaIntegration('WsGenerateIdeasIntegration', wsLambda),
    });

    // Grant WebSocket management permissions to the WS Lambda
    wsLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['execute-api:ManageConnections'],
      resources: [
        `arn:aws:execute-api:${this.region}:${this.account}:${wsApi.apiId}/*`,
      ],
    }));

    // ─── 7. API Gateway Throttling (rate limiting) ──────────────────────

    // HTTP API default throttle: 100 req/s burst, 50 req/s sustained
    const httpStage = httpApi.defaultStage?.node.defaultChild as cdk.aws_apigatewayv2.CfnStage;
    if (httpStage) {
      httpStage.addPropertyOverride('DefaultRouteSettings', {
        ThrottlingBurstLimit: 100,
        ThrottlingRateLimit: 50,
      });
    }

    // ─── 8. Outputs ─────────────────────────────────────────────────────

    new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, 'HttpApiUrl', { value: httpApi.apiEndpoint });
    new cdk.CfnOutput(this, 'WebSocketUrl', { value: wsStage.url });
    new cdk.CfnOutput(this, 'CloudFrontUrl', { value: `https://${distribution.distributionDomainName}` });
    new cdk.CfnOutput(this, 'ImageBucketName', { value: imageBucket.bucketName });
    new cdk.CfnOutput(this, 'FrontendBucketName', { value: frontendBucket.bucketName });
    new cdk.CfnOutput(this, 'DistributionId', { value: distribution.distributionId });
  }
}
