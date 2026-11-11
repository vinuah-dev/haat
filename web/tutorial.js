// The tutorial level: three days in a fixed town (server TUTORIAL_SEED), one lesson a day.
// agents/tutorial.test.ts checks that the moves required here lead to the outcomes described here.

const bread = (ctx) => ctx.moves().bread ?? { make: 0, units: 0, price: 0 };
const othersUntouched = (ctx) => ['grain', 'tools', 'cloth'].every((g) => (ctx.moves()[g]?.make ?? 0) === 0);
const card = (good) => `.good[data-good="${good}"]`;
const field = (good, f) => `${card(good)} [data-field="${f}"]`;

const day1Ready = (ctx) => bread(ctx).make === 4 && bread(ctx).units === 4 && bread(ctx).price === 4 && othersUntouched(ctx);
const day2Ready = (ctx) => bread(ctx).make === 3 && bread(ctx).price >= 12 && bread(ctx).units >= 1 && othersUntouched(ctx);

export const NARRATION = {
  deal: { en: '🔒 Sealed offers. Nobody can see anyone’s price yet.', hi: '🔒 Band lifaafe. Abhi kisi ko kisi ka price nahi dikhta.' },
  reveal: { en: '📬 Everyone opens their envelope. ASK = a seller, BID = a buyer.', hi: '📬 Sab apna lifaafa kholte hain. ASK = bechne wala, BID = khareedne wala.' },
  clear: { en: '⚖️ Cheapest asks meet the highest bids. One price for everyone who trades.', hi: '⚖️ Sabse sasta ASK sabse oonchi BID se milta hai. Jo bhi trade kare, sabko ek hi price.' },
};

export const TUTORIAL = [
  // ---------------- Day 1: make and sell ----------------
  {
    title: { en: 'Welcome to Haat! 👋', hi: 'Haat mein swagat hai! 👋' },
    text: {
      en: 'You run a stall in a market town. Everyone else here (20 buyers and 5 sellers) is an AI agent with its own wallet. In the real game you have 10 days to earn more than them. This tutorial is 3 short days.',
      hi: 'Tum ek bazaar mein dukaan chalate ho. Yahan baaki sab (20 kharidaar aur 5 dukaandaar) AI agents hain, sabka apna wallet hai. Asli game mein 10 din mein inse zyada kamana hai. Ye tutorial sirf 3 chhote din ka hai.',
    },
  },
  {
    target: '#scene',
    title: { en: 'The market square', hi: 'Bazaar' },
    text: {
      en: 'The stalls are the sellers. Yours has the yellow flag. The little people are buyers. Buyers who want the same thing stand together under one sign: that group is a <b>swarm</b>, and it buys together.',
      hi: 'Stalls bechne wale hain. Tumhari stall pe peela jhanda hai. Chhote log kharidaar hain. Jinhe same cheez chahiye, wo ek board ke neeche saath khade hote hain: is group ko <b>swarm</b> kehte hain, aur wo saath mein khareedta hai.',
    },
  },
  {
    target: `${card('bread')} .demand`,
    tab: 'stall',
    title: { en: 'What the swarm wants', hi: 'Swarm ko kya chahiye' },
    text: {
      en: 'Today a swarm wants this much bread. You see <b>how many</b> they want, but not how much they will pay. That stays secret.',
      hi: 'Aaj ek swarm ko itni bread chahiye. Tumhe dikhta hai <b>kitni</b> chahiye, par wo kitna paisa denge, ye secret hai.',
    },
  },
  {
    target: `${card('bread')} [data-fact="cost"]`,
    title: { en: 'Cost', hi: 'Laagat' },
    text: {
      en: 'Making one bread costs <b>3 coins</b>. You pay when you make it, whether it sells or not.',
      hi: 'Ek bread banane mein <b>3 coin</b> lagte hain. Banate hi paisa kat jaata hai, bike ya na bike.',
    },
  },
  {
    target: field('bread', 'make'),
    title: { en: 'Make 4 bread', hi: '4 bread banao' },
    text: { en: 'Press <b>+</b> under <b>Make</b> four times.', hi: '<b>Make</b> ke neeche <b>+</b> ko 4 baar dabao.' },
    hint: { en: 'Make = 4', hi: 'Make = 4 karo' },
    require: (ctx) => bread(ctx).make === 4 && othersUntouched(ctx),
    auto: true,
  },
  {
    target: field('bread', 'units'),
    title: { en: 'Sell', hi: 'Sell' },
    text: {
      en: '<b>Sell</b> is how many you offer. It followed your Make, so it is 4 now.',
      hi: '<b>Sell</b> matlab kitne bechne ke liye rakhoge. Ye apne aap 4 ho gaya.',
    },
  },
  {
    target: field('bread', 'price'),
    title: { en: 'Your lowest price', hi: 'Tumhara sabse kam price' },
    text: {
      en: '<b>Min price</b> is the lowest you will accept for each one. Set it to <b>4</b>: one more than it cost you.',
      hi: '<b>Min price</b> matlab ek bread kam se kam kitne mein bechoge. Ise <b>4</b> karo: laagat se 1 zyada.',
    },
    hint: { en: 'Min price = 4 (Sell stays 4)', hi: 'Min price = 4 karo (Sell 4 hi rahe)' },
    require: day1Ready,
    auto: true,
  },
  {
    title: { en: 'The one rule that matters', hi: 'Sabse zaroori rule' },
    text: {
      en: 'One price clears the whole market. The cheapest sellers sell first, to the buyers who bid highest. Everyone who trades gets <b>the same price</b>: if you ask 4 and the market clears at 5, you get 5.',
      hi: 'Poore market ka <b>ek hi price</b> nikalta hai. Sabse saste seller pehle bikte hain, sabse zyada bid karne wale buyers ko. Jo bhi bikta hai, sabko wahi price milta hai: tumne 4 maanga aur market 5 pe clear hua, toh tumhe 5 milenge.',
    },
  },
  {
    target: '[data-action="submit"]',
    title: { en: 'Seal your offer', hi: 'Offer seal karo' },
    text: {
      en: 'Every offer goes into a sealed envelope (only a hash is posted), so nobody can copy anyone’s price. Press <b>Seal</b>. Next you will see every market open up, one at a time. Each one stops on its result and explains it; press <b>Next round</b> when you have read it.',
      hi: 'Har offer band lifaafe mein jaata hai (sirf ek hash dikhta hai), toh koi kisi ka price copy nahi kar sakta. <b>Seal</b> dabao. Uske baad har market ek-ek karke khulega. Har market apne result pe rukega aur samjhayega; padh lo, phir <b>Agla round</b> dabao.',
    },
    require: day1Ready,
    waitFor: 'sealed',
  },
  { waitFor: 'dayDone', hidden: true },
  {
    target: '[data-stat="coins"]',
    title: { en: 'You made a sale! 🎉', hi: 'Bik gaya! 🎉' },
    text: {
      en: 'Your bread sold and your coins went up. <b>Score</b> = your coins + what your unsold stock is worth.',
      hi: 'Tumhara bread bik gaya aur coins badh gaye. <b>Score</b> = tumhare coins + bache stock ki keemat.',
    },
  },
  {
    target: '.round[data-good="bread"]',
    tab: 'market',
    title: { en: 'The receipt', hi: 'Hisaab' },
    text: {
      en: 'Each market’s result stays here: every ask and bid, who got what, and the price. Find the line that says <b>You</b>.',
      hi: 'Har market ka hisaab yahan rehta hai: har ASK aur BID, kisko kya mila, aur price. <b>You</b> wali line dhoondo.',
    },
  },
  {
    title: { en: 'Auto or step by step', hi: 'Auto ya ek-ek karke' },
    text: {
      en: 'In the tutorial every market stops so you can read it. In the real game the round screen has an <b>Auto</b> button: <b>on</b> plays all markets by themselves, <b>off</b> stops on each result until you press <b>Next round</b>. Your choice is remembered.',
      hi: 'Tutorial mein har market rukta hai taaki tum padh sako. Asli game mein round screen pe <b>Auto</b> button hai: <b>on</b> = saare market apne aap chalenge, <b>off</b> = har result pe rukega jab tak tum <b>Agla round</b> na dabao. Tumhari choice yaad rahegi.',
    },
  },
  { waitFor: 'morning', hidden: true },

  // ---------------- Day 2: asking too much ----------------
  {
    target: card('bread'),
    tab: 'stall',
    title: { en: 'Day 2 · What greed does', hi: 'Din 2 · Laalach ka nateeja' },
    text: {
      en: 'Let’s try asking too much. Make <b>3</b> more bread and set <b>Min price</b> to <b>12</b>. You can type the number into the box.',
      hi: 'Ab bahut zyada maang ke dekhte hain. <b>3</b> aur bread banao aur <b>Min price</b> ko <b>12</b> kar do. Box mein number type bhi kar sakte ho.',
    },
    hint: { en: 'Make = 3, Min price = 12', hi: 'Make = 3, Min price = 12' },
    require: day2Ready,
    auto: true,
  },
  {
    target: '[data-action="submit"]',
    title: { en: 'Seal it and watch', hi: 'Seal karo aur dekho' },
    text: { en: 'Press <b>Seal</b>.', hi: '<b>Seal</b> dabao.' },
    require: day2Ready,
    waitFor: 'sealed',
  },
  { waitFor: 'dayDone', hidden: true },
  {
    target: '.round[data-good="bread"]',
    tab: 'market',
    title: { en: 'Nothing sold 😬', hi: 'Kuch nahi bika 😬' },
    text: {
      en: 'No buyer would pay 12, so the market cleared without you. You still paid to make that bread.',
      hi: 'Koi buyer 12 nahi deta, toh market tumhare bina clear ho gaya. Bread banane ka paisa phir bhi gaya.',
    },
  },
  {
    title: { en: 'Leftovers spoil', hi: 'Bacha maal kharab hota hai' },
    text: {
      en: 'Unsold stock waits for tomorrow, but <b>a quarter of it spoils overnight</b>. So make what you can sell, and price near the <b>Last price</b>.',
      hi: 'Na bika stock kal ke liye bachta hai, par <b>raat mein uska 25% kharab</b> ho jaata hai. Isliye utna banao jitna bik sake, aur price <b>Last price</b> ke paas rakho.',
    },
  },
  { waitFor: 'morning', hidden: true },

  // ---------------- Day 3: events, then on your own ----------------
  {
    target: '.events',
    tab: 'stall',
    title: { en: 'Day 3 · Events', hi: 'Din 3 · Events' },
    text: {
      en: 'Events change the market. Today is a <b>festival</b>: everyone wants bread, so demand doubled. Look at the market square too. The agents react to events on their own.',
      hi: 'Events market badal dete hain. Aaj <b>festival</b> hai: sabko bread chahiye, demand double ho gayi. Upar bazaar bhi dekho. Agents events pe khud react karte hain.',
    },
  },
  {
    target: card('bread'),
    title: { en: 'Your turn', hi: 'Ab tumhari baari' },
    text: {
      en: 'Decide for yourself: how much bread to make, how many to sell and at what lowest price. Tip: price near the Last price and sell your leftovers too.',
      hi: 'Ab khud socho: kitni bread banani hai, kitni bechni hai, aur kam se kam kis price pe. Tip: price Last price ke paas rakho, aur bacha stock bhi bech do.',
    },
  },
  {
    target: '[data-action="submit"]',
    title: { en: 'Seal when ready', hi: 'Ready ho toh seal karo' },
    text: { en: 'Press <b>Seal</b> when you are happy with your offer.', hi: 'Offer theek lage toh <b>Seal</b> dabao.' },
    waitFor: 'sealed',
  },
  { waitFor: 'dayDone', hidden: true },
  {
    target: (ctx) => (ctx.layout() === 'mobile' ? '[data-stat="rank"]' : '.board'),
    title: { en: 'You’re ready! 🏆', hi: 'Tum ready ho! 🏆' },
    text: {
      en: 'That is the whole game: read the swarm, make the right amount, price near the market, and watch for events. The real game is 10 days against the same agents.',
      hi: 'Bas itna hi game hai: swarm dekho, sahi maatra mein banao, price market ke paas rakho, aur events pe nazar rakho. Asli game 10 din ka hai, inhi agents ke saath.',
    },
    button: { en: 'Start the real game →', hi: 'Asli game shuru karo →' },
    final: true,
  },
];
