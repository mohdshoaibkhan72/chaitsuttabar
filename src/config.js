// Business details used across the site. Replace the placeholders with your real info.
export const SITE = {
  name: 'Chai Sutta Bar',
  // WhatsApp number in international format without "+" or spaces, e.g. '919876543210'.
  // Leave empty and the "Order on WhatsApp" button lets the customer pick a chat.
  whatsapp: '',
  phone: '+91 00000 00000',
  email: 'hello@chaitsuttabar.com',
  address: ['Your street address here', 'City, State – PIN'],
  // day: 0 = Sunday … 6 = Saturday. `close` may be past midnight (e.g. '01:00').
  hours: [
    { days: [1, 2, 3, 4, 5], open: '10:00', close: '01:00', label: 'Mon – Fri · 10 AM – 1 AM' },
    { days: [0, 6], open: '09:00', close: '03:00', label: 'Sat – Sun · 9 AM – 3 AM' },
  ],
}
