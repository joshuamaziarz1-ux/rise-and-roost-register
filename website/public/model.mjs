export const ZONE = "America/Indiana/Indianapolis";
export const clone = (value) => JSON.parse(JSON.stringify(value));
export const money = (cents) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100,
  );
const timeFormatters = new Map();
export function localInstant(date, time, zone = ZONE) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time))
    throw new Error("Use a valid date and time.");
  const target = date + "T" + time;
  if (!timeFormatters.has(zone))
    timeFormatters.set(
      zone,
      new Intl.DateTimeFormat("en-CA", {
        timeZone: zone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }),
    );
  const parts = (value) => {
    const p = Object.fromEntries(
      timeFormatters
        .get(zone)
        .formatToParts(value)
        .map((p) => [p.type, p.value]),
    );
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
  };
  const guess = Date.parse(target + ":00Z");
  const matches = [];
  for (let offset = -14 * 60; offset <= 14 * 60; offset += 15) {
    const instant = guess + offset * 60000;
    if (parts(instant) === target) matches.push(instant);
  }
  if (matches.length !== 1)
    throw new Error(
      "This local time is invalid or ambiguous because of daylight saving. Choose another time.",
    );
  return matches[0];
}
export function safeLink(value) {
  if (typeof value !== "string") return false;
  if (/^\/(?!\/)[a-zA-Z0-9/_#?=.%&-]*$/.test(value)) return true;
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password;
  } catch {
    return false;
  }
}
// Customer display only. Stored wall-clock values and scheduling calculations
// continue to use localInstant and the Indiana time zone above.
const customerDate = new Intl.DateTimeFormat("en-US", {
  timeZone: ZONE, weekday: "long", month: "long", day: "numeric",
});
const customerClocks = [false, true].map(seconds => new Intl.DateTimeFormat("en-US", {
  timeZone: ZONE, hour: "numeric", minute: "2-digit", ...(seconds ? { second: "2-digit" } : {}), hour12: true,
}));
const customerEvent = new Intl.DateTimeFormat("en-US", {
  timeZone: ZONE, weekday: "long", month: "long", day: "numeric", year: "numeric",
  hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true,
});
const normalSpaces = text => text.replace(/[\u00a0\u202f]/g, " ");
export function customerTime(value, seconds = false) {
  return normalSpaces(customerClocks[Number(seconds)].format(new Date(value)));
}
export function customerTimestamp(value) {
  return normalSpaces(customerEvent.format(new Date(value)));
}
export function pickupLabel(p) {
  const start = localInstant(p.date, p.start);
  return `${customerDate.format(start)} · ${customerTime(start)} – ${customerTime(localInstant(p.date, p.end))}`;
}
export function orderByLabel(p) {
  const cutoff = localInstant(p.cutoffDate, p.cutoffTime);
  return `${customerDate.format(cutoff)} at ${customerTime(cutoff)}`;
}
export function seed(now = Date.now()) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const pickups = [];
  for (let i = 2; pickups.length < 4; i++) {
    const date = new Date(Date.parse(today + "T12:00:00Z") + i * 86400000);
    if (![2, 5].includes(date.getUTCDay())) continue;
    const day = date.toISOString().slice(0, 10),
      cutoffDate = new Date(date.getTime() - 86400000)
        .toISOString()
        .slice(0, 10);
    pickups.push({
      id: "pickup-" + day,
      date: day,
      start: "15:00",
      end: "18:00",
      cutoffDate,
      cutoffTime: "18:00",
      capacity: 12,
      closed: false,
    });
  }
  const text = (id, title, body, type = "text") => ({
    id,
    type,
    title,
    body,
    hidden: false,
    image: "",
    alt: "",
    button: "Explore the shop",
    link: "/shop",
    color: "",
    background: "",
    align: "left",
    padding: 72,
    fontSize: 48,
    items: [],
  });
  return {
    business: {
      name: "Rise & Roost",
      tagline: "Good things, made slowly.",
      email: "",
      address: "Add your farm stand address in Website Studio",
      hours: "Hours & Days May Vary",
      story: "A little slower. A little closer to home.",
      zone: ZONE,
      logo: "/assets/logo.webp",
      logoAlt: "Rise & Roost",
    },
    theme: {
      preset: "farmhouse",
      background: "#faf7f0",
      surface: "#ffffff",
      ink: "#263b30",
      primary: "#3e5946",
      accent: "#b77d55",
      muted: "#6c7266",
      font: "Georgia",
      bodyFont: "system-ui",
      width: 1240,
      spacing: 72,
      radius: 8,
      buttonRadius: 4,
      fontSize: 17,
      customCSS: "",
    },
    ui: {
      announcement: "A little farm stand. A whole lot of heart.",
      shop: "Shop the stand",
      cart: "Your basket",
      add: "Add to basket",
      empty: "Your basket is waiting for something good.",
      checkout: "Request a demo preorder",
      pickup: "Choose your pickup",
      orderBy: "Order by",
      soldOut: "Sold out",
      quantity: "Quantity",
      remove: "Remove",
      continue: "Keep exploring",
      footer: "Made with care. Shared with our neighbors.",
      productNote:
        "Sample catalog · Illustrations are placeholders, not product photographs.",
      preorder: "Preorder",
      inStore: "In-store only",
      simulated: "Demo request received — no payment collected.",
      policy:
        "These are sample pickup and cancellation policies. No real order is placed. Please replace with your approved policies before a real launch.",
      faqTitle: "A few good things to know",
      variety: "Variety",
      heroStamp: "SLOW MADE. SOUL FED.",
      artCaption: "A taste of the everyday good.",
      contactTitle: "Come say hello",
      contactBody:
        "We would love to hear from you. Add your preferred public contact details in Studio.",
      terms:
        "Demo website for review only. No payment processing or real fulfillment.",
      privacy:
        "Please use fictional information in this demo. We do not request payment information.",
    },
    pages: [
      {
        id: "home",
        slug: "/",
        title: "Home",
        showInNav: true,
        sections: [
          {
            ...text(
              "hero",
              "A little homemade.\nA lot of heart.",
              "Small-batch bakes, farm-fresh favorites, and the simple joy of knowing where your food comes from.",
              "hero",
            ),
            fontSize: 72,
            button: "Shop our favorites",
            link: "/shop",
          },
          text(
            "collection",
            "From our kitchen,\nto your table.",
            "Thoughtfully made. Happily shared. Find a new favorite for your next visit.",
            "products",
          ),
          {
            ...text(
              "story",
              "Rooted in the everyday good.",
              "Warm bread on the counter. Eggs gathered with care. A friendly stop on the way home. This is our editable starter story — make it yours.",
              "split",
            ),
            button: "Our story",
            link: "/about",
          },
          {
            ...text(
              "pickup",
              "Your next good thing\nis just a pickup away.",
              "Choose a day, fill your basket, and we will have something lovely waiting. All schedules shown are examples.",
              "cta",
            ),
            button: "Plan your pickup",
            link: "/shop",
          },
        ],
      },
      {
        id: "shop",
        slug: "/shop",
        title: "Shop",
        showInNav: true,
        sections: [
          text(
            "shop-intro",
            "Fresh from the stand.",
            "A sample collection of simple, lovely things. Choose a favorite and an available pickup date.",
            "text",
          ),
          text("shop-products", "Something for your table.", "", "products"),
        ],
      },
      {
        id: "about",
        slug: "/about",
        title: "Our story",
        showInNav: true,
        sections: [
          text(
            "about-story",
            "Good food. Good neighbors.",
            "Rise & Roost is a place for the small things that make an ordinary day feel special. This is starter copy for Danielle to replace with the real family story.",
            "split",
          ),
        ],
      },
      {
        id: "visit",
        slug: "/visit",
        title: "Visit us",
        showInNav: true,
        sections: [
          text(
            "visit-text",
            "Take the scenic route.",
            "Stop by, slow down, and find something good. Confirm our location and current availability before planning a visit.",
            "visit",
          ),
        ],
      },
      {
        id: "contact",
        slug: "/contact",
        title: "Contact & FAQ",
        showInNav: true,
        sections: [
          {
            ...text(
              "contact-info",
              "A friendly hello starts here.",
              "Add the public email or contact channel you want your neighbors to use.",
              "contact",
            ),
          },
          {
            ...text("faq", "Before you stop by.", "", "faq"),
            items: [
              {
                title: "When can I pick up?",
                body: "Select an available pickup window in your basket. Tuesday and Friday are editable sample defaults.",
              },
              {
                title: "Is this a real order?",
                body: "This beta only simulates requests. Nothing is charged or sent to the real store.",
              },
            ],
          },
        ],
      },
      {
        id: "terms",
        slug: "/terms",
        title: "Terms & privacy",
        showInNav: false,
        sections: [
          text(
            "terms-text",
            "A little clarity.",
            "This is an isolated demo. No real purchases, payments, or fulfillment. Use sample information only. Danielle can replace this with approved terms and privacy copy.",
          ),
        ],
      },
    ],
    products: [
      {
        id: "bread",
        name: "Slow Sunday sourdough",
        description:
          "A golden crust, a soft center, and a little patience in every loaf. Sample product and price.",
        price: 900,
        active: true,
        channel: "preorder",
        stock: 24,
        capacity: 8,
        variants: [
          { id: "classic", name: "Classic loaf", extra: 0 },
          { id: "rosemary", name: "Rosemary", extra: 100 },
        ],
        images: [
          {
            src: "/assets/bread.svg",
            alt: "Illustrated sample sourdough loaf",
            x: 50,
            y: 50,
          },
        ],
        placeholder: true,
      },
      {
        id: "eggs",
        name: "A dozen little sunrises",
        description:
          "A farmhouse favorite for slow breakfasts and everyday baking. Sample product and price.",
        price: 500,
        active: true,
        channel: "preorder",
        stock: 24,
        capacity: 8,
        variants: [{ id: "dozen", name: "One dozen", extra: 0 }],
        images: [
          {
            src: "/assets/eggs.svg",
            alt: "Illustrated sample egg carton",
            x: 50,
            y: 50,
          },
        ],
        placeholder: true,
      },
      {
        id: "rolls",
        name: "Morning cinnamon rolls",
        description:
          "Soft swirls and a sweet little reason to linger. Sample product and price.",
        price: 1200,
        active: true,
        channel: "preorder",
        stock: 16,
        capacity: 6,
        variants: [{ id: "four", name: "Box of four", extra: 0 }],
        images: [
          {
            src: "/assets/rolls.svg",
            alt: "Illustrated sample cinnamon rolls",
            x: 50,
            y: 50,
          },
        ],
        placeholder: true,
      },
    ],
    pickups,
  };
}
