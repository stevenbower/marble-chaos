import countries from 'flag-icons/country.json';

const urls = import.meta.glob('/node_modules/flag-icons/flags/1x1/*.svg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const EXTRA = new Set(['xk', 'gb-eng', 'gb-sct', 'gb-wls', 'eu']);

export const flagUrl = (code: string) => urls[`/node_modules/flag-icons/flags/1x1/${code}.svg`];

export const COUNTRIES = (countries as { code: string; name: string; iso: boolean }[])
  .filter((c) => (c.iso || EXTRA.has(c.code)) && flagUrl(c.code))
  .map((c) => ({ code: c.code, name: c.name }))
  .sort((a, b) => a.name.localeCompare(b.name));

export const countryName = (code: string) => COUNTRIES.find((c) => c.code === code)?.name ?? code.toUpperCase();
