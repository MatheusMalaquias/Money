// Cores semânticas via variáveis CSS (src/index.css): o mesmo componente serve ao tema claro e ao escuro.
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        app: v('app'), // fundo da tela
        card: v('card'), // cartões e sheets
        raised: v('raised'), // campos e itens sobre o cartão
        line: v('line'), // bordas
        main: v('main'), // texto principal
        muted: v('muted'), // texto secundário
        accent: v('accent'),
        'on-accent': v('on-accent'), // texto sobre fundo accent
        good: v('good'),
        bad: v('bad'),
        warn: v('warn'),
        s1: v('s1'),
        s2: v('s2'),
      },
    },
  },
  plugins: [],
}
