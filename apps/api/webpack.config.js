const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin')
const { join } = require('node:path')

module.exports = {
  output: {
    path: join(__dirname, 'dist'),
  },
  plugins: [
    new NxAppWebpackPlugin({
      target: 'node',
      compiler: 'tsc',
      main: join(__dirname, 'src/main.ts'),
      tsConfig: './tsconfig.app.json',
      assets: ['./src/assets'],
      optimization: false,
      outputHashing: 'none',
      generatePackageJson: true,
    }),
  ],
  resolve: {
    alias: {
      '@/*': join(__dirname, 'src/app'),
      '@integrations/*': join(__dirname, 'src/app/integrations/*'),
      '@modules/*': join(__dirname, 'src/app/modules/*'),
      '@prisma/generated': join(__dirname, 'prisma/generated'),
      '@prisma/generated/*': join(__dirname, 'prisma/generated/*'),
      '@core': join(__dirname, 'src/app/core'),
      '@shared': join(__dirname, 'src/app/shared'),
    },
  },
}
