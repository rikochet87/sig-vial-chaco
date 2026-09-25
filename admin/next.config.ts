import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * La raíz del workspace, explícita.
   *
   * Hay dos `package-lock.json` en el repo —la app móvil en la raíz y el panel
   * acá— y Turbopack elegía el de la app móvil como raíz. Eso afecta la
   * resolución de módulos y el rastreo de archivos del build, y avisaba en cada
   * corrida. Con esto queda fijado en el panel, que es lo que se está
   * construyendo.
   */
  turbopack: { root: __dirname },
};

export default nextConfig;
