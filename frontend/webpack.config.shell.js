// ==============================================================================
// Webpack 5 Module Federation - Shell Host Configuration
// ==============================================================================
const HtmlWebpackPlugin = require('html-webpack-plugin');
const { ModuleFederationPlugin } = require('webpack').container;
const path = require('path');

module.exports = {
  entry: './src/index.ts',
  mode: 'production',
  output: {
    publicPath: 'http://localhost:3000/',
    clean: true,
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.jsx', '.js', '.json'],
  },
  module: {
    rules: [
      {
        test: /\.(ts|tsx)$/,
        loader: 'babel-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  plugins: [
    new ModuleFederationPlugin({
      name: 'shell_host',
      remotes: {
        checkoutMfe: 'checkoutMfe@http://localhost:3001/remoteEntry.js',
        ledgerActivityMfe: 'ledgerActivityMfe@http://localhost:3002/remoteEntry.js',
        metricsMfe: 'metricsMfe@http://localhost:3003/remoteEntry.js',
      },
      shared: {
        react: { singleton: true, requiredVersion: '^18.2.0' },
        'react-dom': { singleton: true, requiredVersion: '^18.2.0' },
      },
    }),
    new HtmlWebpackPlugin({
      template: './index.html',
    }),
  ],
};
