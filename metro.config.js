const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Permite importar archivos .geojson directamente como módulos JSON
config.resolver.sourceExts = [...config.resolver.sourceExts, 'geojson'];

module.exports = config;
