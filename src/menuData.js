const item = (name, desc, price, extra = {}) => ({ name, desc, price, ...extra })

export const CATEGORIES = [
  {
    id: 'chai',
    label: 'Chai',
    blurb: 'Brewed slow in kulhads, the way the street does it.',
    items: [
      item('Kulhad Chai', 'Classic milk tea in a clay cup', 30, { best: true }),
      item('Masala Chai', 'Ginger, cardamom, black pepper', 35, { best: true }),
      item('Adrak Elaichi Chai', 'Strong ginger & green cardamom', 35),
      item('Kesar Chai', 'Saffron-infused, slow simmered', 55),
      item('Tulsi Green Chai', 'Holy basil, light & refreshing', 40),
      item('Irani Chai', 'Hyderabadi style, creamy & rich', 45),
    ],
  },
  {
    id: 'pizza',
    label: 'Pizza',
    blurb: 'Hand-stretched, stone-baked, loaded with mozzarella.',
    items: [
      item('Margherita', 'Tomato, mozzarella & fresh basil', 149, { best: true }),
      item('Farmhouse', 'Capsicum, onion, tomato, mushroom', 219),
      item('Peppy Paneer', 'Paneer tikka, red paprika, onion', 239, { best: true }),
      item('Veggie Supreme', 'Olives, corn, jalapeño, peppers', 249),
      item('Corn & Cheese', 'Sweet corn with a triple-cheese blend', 199),
      item('Chicken Tikka', 'Tandoori chicken, onion, mint mayo', 269, { nonveg: true }),
    ],
  },
  {
    id: 'burgers',
    label: 'Burgers',
    blurb: 'Big bites, toasted buns and a proper smash.',
    items: [
      item('Aloo Tikki Burger', 'Crispy patty, mint mayo, onion', 79, { best: true }),
      item('Cheese Veg Burger', 'Veg patty, cheese slice, slaw', 99),
      item('Paneer Crunch', 'Crumb-fried paneer, chipotle sauce', 129),
      item('Double Patty Cheese', 'Two patties, double cheese', 159, { best: true }),
      item('Chicken Zinger', 'Spicy fried chicken, lettuce, mayo', 149, { nonveg: true }),
      item('Crispy Fries', 'Peri-peri dust, cheese dip', 89),
    ],
  },
  {
    id: 'pasta',
    label: 'Pasta',
    blurb: 'Silky sauces, al dente pasta, extra parmesan.',
    items: [
      item('White Sauce Pasta', 'Creamy penne with herbs', 149, { best: true }),
      item('Red Sauce Pasta', 'Tangy arrabbiata penne', 139),
      item('Pink Sauce Pasta', 'Best of red and white', 159),
      item('Mac & Cheese', 'Baked, golden & extra cheesy', 169),
      item('Pesto Pasta', 'Basil, garlic, pine nuts', 179),
      item('Chicken Alfredo', 'Grilled chicken in garlic cream', 189, { nonveg: true }),
    ],
  },
  {
    id: 'sandwich',
    label: 'Sandwich',
    blurb: 'Grilled until golden, stacked until it spills.',
    items: [
      item('Veg Grilled Sandwich', 'Cucumber, tomato, cheese, chutney', 89, { best: true }),
      item('Cheese Corn Sandwich', 'Sweet corn & melted cheese', 109),
      item('Paneer Tikka Sandwich', 'Smoky paneer, onions, mint', 129),
      item('Bombay Masala', 'Potato, beetroot, green chutney', 99),
      item('Club Sandwich', 'Triple decker with fries', 139, { best: true }),
      item('Chicken Mayo', 'Shredded chicken, lettuce, mayo', 139, { nonveg: true }),
    ],
  },
  {
    id: 'maggi',
    label: 'Maggi',
    blurb: 'Comfort noodles for 2 AM hunger.',
    items: [
      item('Masala Maggi', 'The OG, with veggies & spice', 60, { best: true }),
      item('Cheese Maggi', 'Loaded with melted cheese', 80),
      item('Peri Peri Maggi', 'Fiery with a tangy kick', 85),
      item('Veg Butter Maggi', 'Tossed with butter & peas', 75),
      item('Schezwan Maggi', 'Street-style, wok-tossed', 90),
      item('Egg Maggi', 'Scrambled egg tossed in', 80, { nonveg: true }),
    ],
  },
  {
    id: 'coffee',
    label: 'Cold Coffee',
    blurb: 'Thick, chilled and topped with cream.',
    items: [
      item('Classic Cold Coffee', 'Blended with milk & ice cream', 99, { best: true }),
      item('Hazelnut Cold Coffee', 'Roasted hazelnut syrup', 119),
      item('Choco Frappe', 'Chocolate, coffee & whipped cream', 129, { best: true }),
      item('Iced Mocha', 'Espresso, chocolate, milk', 129),
      item('Caramel Cold Brew', '12-hour brew, salted caramel', 129),
      item('Iced Latte', 'Espresso over cold milk', 119),
    ],
  },
  {
    id: 'drinks',
    label: 'Drinks',
    blurb: 'Fizz, citrus and everything cold.',
    items: [
      item('Virgin Mojito', 'Mint, lime & soda', 89, { best: true }),
      item('Fresh Lime Soda', 'Sweet, salted or masala', 59),
      item('Cola', 'Served over ice with lemon', 40),
      item('Blue Lagoon', 'Blue curaçao syrup, lemon, soda', 99),
      item('Watermelon Cooler', 'Fresh pressed, mint, ice', 89),
      item('Peach Iced Tea', 'Cold brewed black tea & peach', 79),
    ],
  },
  {
    id: 'snacks',
    label: 'Snacks',
    blurb: 'Crisp, hot and made to dunk in chai.',
    items: [
      item('Punjabi Samosa', 'Two pieces, tamarind & mint chutney', 40, { best: true }),
      item('Bread Pakora', 'Stuffed, gram-flour fried', 40),
      item('Kachori Sabzi', 'Flaky kachori with aloo curry', 60),
      item('Aloo Tikki', 'Griddle-crisp potato patties', 55),
      item('Paneer Pakora', 'Spiced paneer fritters', 90),
      item('Masala Papad', 'Roasted, onion-tomato topped', 35),
    ],
  },
  {
    id: 'sweets',
    label: 'Sweets',
    blurb: 'Because every meal deserves a sweet ending.',
    items: [
      item('Gulab Jamun', 'Warm, two pieces in syrup', 60, { best: true }),
      item('Bun Maska', 'Soft bun, loads of butter', 45),
      item('Walnut Brownie', 'Fudgy, served warm', 110),
      item('Sweet Lassi', 'Punjabi style, topped with malai', 80),
      item('Ice Cream Sundae', 'Vanilla, hot fudge, nuts', 119),
      item('Chocolate Shake', 'Thick & dark', 109),
    ],
  },
]

// Combo deals: `was` is the price of the items bought separately. `shot` picks the card image.
export const COMBOS = [
  { id: 'chai-samosa', name: 'Chai & Samosa', desc: 'Kulhad chai with two hot Punjabi samosas', price: 65, was: 70, tag: 'Evening classic', shot: ['snacks', 0] },
  { id: 'maggi-coffee', name: 'Maggi + Cold Coffee', desc: 'Masala Maggi with a classic cold coffee', price: 149, was: 159, tag: 'Late-night fuel', shot: ['maggi', 1] },
  { id: 'burger-meal', name: 'Burger Meal', desc: 'Cheese veg burger, crispy fries and a cola', price: 199, was: 228, tag: 'Best value', shot: ['burgers', 2] },
  { id: 'pizza-mojitos', name: 'Pizza & Mojitos', desc: 'Margherita with two virgin mojitos', price: 299, was: 327, tag: 'Share it', shot: ['pizza', 3] },
]
