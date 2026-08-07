/** @type {import('next').NextConfig} */
const nextConfig = {
  output: process.env.NEXT_OUTPUT_MODE,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  images: { unoptimized: true },
  experimental: {
    // Sólo importa en el bundle de cliente los módulos de cada ícono que
    // realmente se usa, en vez del paquete completo — lucide-react es el
    // que más superficie tiene en este repo (iconos en casi cada página).
    // Los @radix-ui/react-* que quedaron tras la purga de dependencias no
    // se listan aquí: cada uno es un paquete propio y pequeño (no un
    // barrel file grande como lucide-react), así que no hay nada que
    // ganar optimizándolos.
    optimizePackageImports: ['lucide-react'],
  },
};

module.exports = nextConfig;
