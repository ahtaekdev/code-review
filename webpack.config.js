const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

const tsRule = {
  test: /\.tsx?$/,
  use: 'ts-loader',
  exclude: /node_modules/,
};

const resolve = {
  extensions: ['.tsx', '.ts', '.js'],
};

const nodeConfig = { __dirname: false, __filename: false };

const mainConfig = {
  target: 'electron-main',
  entry: './src/main/index.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'main.js',
  },
  module: { rules: [tsRule] },
  resolve,
  node: nodeConfig,
};

const preloadConfig = {
  target: 'electron-preload',
  entry: './src/preload/index.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'preload.js',
  },
  module: { rules: [tsRule] },
  resolve,
  node: nodeConfig,
};

const rendererConfig = {
  devtool: 'source-map',
  target: 'web',
  entry: './src/renderer/index.tsx',
  output: {
    path: path.resolve(__dirname, 'dist/renderer'),
    filename: 'bundle.js',
  },
  module: {
    rules: [
      tsRule,
      { test: /\.(ttf|woff2?|eot|otf)$/, type: 'asset/resource' },
    ],
  },
  resolve,
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/renderer/index.html',
    }),
  ],
};

module.exports = [mainConfig, preloadConfig, rendererConfig];
