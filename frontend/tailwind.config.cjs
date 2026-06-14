module.exports = {
  content: ['./index.html', './src/**/*.{js,ts}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],
        body: ['"Manrope"', 'sans-serif']
      },
      colors: {
        ink: '#0f172a',
        mist: '#e2e8f0',
        cloud: '#f8fafc',
        ocean: '#0ea5a4',
        sunrise: '#f97316',
        moss: '#16a34a'
      },
      boxShadow: {
        float: '0 20px 45px -30px rgba(15, 23, 42, 0.6)'
      }
    }
  },
  plugins: []
};
