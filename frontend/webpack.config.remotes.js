// ==============================================================================
// Webpack 5 Module Federation - Remote Modules Exposes Configuration
// ==============================================================================
const { ModuleFederationPlugin } = require('webpack').container;

module.exports = {
  // Remote 1: Checkout MFE (Port 3001)
  checkoutConfig: {
    plugins: [
      new ModuleFederationPlugin({
        name: 'checkoutMfe',
        filename: 'remoteEntry.js',
        exposes: {
          './CheckoutMfe': './src/remotes/checkout/CheckoutMfe',
        },
        shared: {
          react: { singleton: true, requiredVersion: '^18.2.0' },
          'react-dom': { singleton: true, requiredVersion: '^18.2.0' },
        },
      }),
    ],
  },

  // Remote 2: Ledger Activity MFE (Port 3002)
  ledgerConfig: {
    plugins: [
      new ModuleFederationPlugin({
        name: 'ledgerActivityMfe',
        filename: 'remoteEntry.js',
        exposes: {
          './LedgerActivityMfe': './src/remotes/ledger/LedgerActivityMfe',
        },
        shared: {
          react: { singleton: true, requiredVersion: '^18.2.0' },
          'react-dom': { singleton: true, requiredVersion: '^18.2.0' },
        },
      }),
    ],
  },

  // Remote 3: Live System Metrics & Chaos MFE (Port 3003)
  metricsConfig: {
    plugins: [
      new ModuleFederationPlugin({
        name: 'metricsMfe',
        filename: 'remoteEntry.js',
        exposes: {
          './MetricsMfe': './src/remotes/metrics/MetricsMfe',
        },
        shared: {
          react: { singleton: true, requiredVersion: '^18.2.0' },
          'react-dom': { singleton: true, requiredVersion: '^18.2.0' },
        },
      }),
    ],
  },
};
