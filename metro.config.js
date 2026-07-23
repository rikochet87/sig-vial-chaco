const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Permite importar archivos .geojson directamente como módulos JSON
config.resolver.sourceExts = [...config.resolver.sourceExts, 'geojson'];

// Defer module evaluation to first use — reduces cold-start time significantly.
// GEO_BUNDLE_CC (7.7 MB) and other large bundles won't be evaluated until
// the screen that actually needs them is first accessed.
config.transformer.getTransformOptions = async () => ({
  transform: {
    inlineRequires: true,
  },
});

module.exports = config;
