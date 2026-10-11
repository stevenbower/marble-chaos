import { defineConfig } from 'vite';

// Let the dev/preview servers answer to Tailscale MagicDNS names as well as IPs.
const allowedHosts = ['.ts.net'];

// Relative asset paths, so the build works from a sub-path such as GitHub Pages' /marble-chaos/.
export default defineConfig({ base: './', server: { allowedHosts }, preview: { allowedHosts } });
