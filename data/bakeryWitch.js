export const BAKERY_WITCH_BOOK = {
  title: 'Witch Studio',
  tagLine: 'NANO-BANANA POWERED',
  characterGuide:
    "A 10-year-old girl named Hazel, round freckled face, wire-rim glasses, bubble pigtails with star bows. She wears a tall pointed witch's hat with a heart charm, a short-sleeved dress, and a ruffled white apron. Bold black and white line art, professional coloring book style, no shading.",
  pages: [
    {
      id: 1,
      title: '1. The Title Page',
      scene:
        "Hazel standing in front of a giant teapot-shaped bakery. A sign says 'The Bakery Witch'.",
    },
    {
      id: 3,
      title: '3. The Secret Recipe',
      scene:
        'Hazel looking at an ancient cookbook on a flour-covered table in a magical kitchen.',
    },
    {
      id: 5,
      title: '5. Magical Ingredients',
      scene:
        'A close-up of a recipe scroll with icons for Moon-Sugar, Sun-Berries, and Dragon Spark.',
    },
    {
      id: 7,
      title: '7. The Hat and Basket',
      scene:
        'Hazel putting on her big witch hat and picking up a woven basket to go outside.',
    },
    {
      id: 9,
      title: '9. The Teapot Cottage',
      scene:
        "A wide view of Hazel's cottage shaped like a teapot with a garden of singing flowers.",
    },
    {
      id: 11,
      title: '11. The Singing Path',
      scene:
        'Hazel walking down a path lined with sunflowers that have happy faces and are singing.',
    },
    {
      id: 13,
      title: '13. Mushroom Gnomes',
      scene:
        'Hazel meeting tiny gnomes with baker hats in a forest of giant spotted mushrooms.',
    },
    {
      id: 15,
      title: '15. The Fair Trade',
      scene:
        'Hazel trading a shiny button to a gnome for a jar of glowing mushroom spores.',
    },
    {
      id: 17,
      title: '17. Levitation Spell',
      scene:
        'Hazel floating in the air to pick glowing berries from a very tall magical bush.',
    },
    {
      id: 19,
      title: '19. The Turtle Ferry',
      scene:
        'Hazel and Mochi the cat riding on the back of a giant friendly turtle across a river.',
    },
    {
      id: 21,
      title: '21. Puff the Dragon',
      scene:
        'A friendly noodle dragon wearing glasses in a cozy library cave, reading to Hazel.',
    },
    {
      id: 23,
      title: '23. A Gift of Fire',
      scene:
        'The dragon blowing a tiny magical spark into a glass lantern held by Hazel.',
    },
    {
      id: 25,
      title: '25. Giggling Apples',
      scene:
        'Hazel picking apples that have little mouths and are laughing in a whimsical orchard.',
    },
    {
      id: 27,
      title: '27. Leaf Umbrella',
      scene:
        'Hazel holding a giant leaf over her head while frogs dance around her in the rain.',
    },
    {
      id: 29,
      title: '29. The Sky Whale',
      scene:
        'A massive whale floating through the clouds as Hazel waves from the mountain top.',
    },
    {
      id: 31,
      title: '31. The Star Mill',
      scene:
        'A windmill with shimmering sails grinding starlight into glowing moon-sugar.',
    },
    {
      id: 33,
      title: '33. The Full Basket',
      scene:
        'Hazel sitting on a stump, her basket glowing with all the magical ingredients gathered.',
    },
    {
      id: 35,
      title: '35. Moonlight Walk',
      scene:
        'A silhouette of Hazel walking home under a giant glowing crescent moon.',
    },
    {
      id: 37,
      title: '37. The Mixing Bowl',
      scene:
        'Hazel stirring a bowl with magical sparkles and star-shaped steam rising up.',
    },
    {
      id: 39,
      title: '39. The Magic Oven',
      scene:
        'Hazel looking into an oven glowing with warm magical light from the dragon spark.',
    },
    {
      id: 41,
      title: '41. Baking Nap',
      scene:
        'Hazel and Mochi the cat napping on the kitchen floor while the cake bakes.',
    },
    {
      id: 43,
      title: '43. Star-Light Cake',
      scene:
        'Hazel holding a beautiful cake that looks like a galaxy with star fruit on top.',
    },
    {
      id: 45,
      title: '45. The Forest Feast',
      scene:
        'The dragon, gnomes, and turtle all eating cake together at a long forest table.',
    },
    {
      id: 47,
      title: '47. Pure Magic',
      scene:
        'Hazel taking a bite and her hair standing up and glowing with tiny stars.',
    },
  ].map((p, idx) => ({
    ...p,
    prompt: p.scene,
    sortOrder: idx,
  })),
};

export default BAKERY_WITCH_BOOK;
