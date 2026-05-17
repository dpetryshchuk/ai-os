import { createConfig } from '../../../packages/ui/tailwind.config.base.mjs'

export default createConfig({
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
})
