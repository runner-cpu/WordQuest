/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    // 像素字体只在 12 的整数倍上渲染才不糊，因此覆盖默认字号刻度
    fontSize: {
      px12: ['12px', '1.6'],
      px24: ['24px', '1.3'],
      px36: ['36px', '1.15'],
      px48: ['48px', '1.05'],
    },
    extend: {
      colors: {
        ink: 'var(--wq-bg)',
        panel: 'var(--wq-panel)',
        'panel-2': 'var(--wq-panel-2)',
        edge: 'var(--wq-edge)',
        gold: 'var(--wq-gold)',
        pass: 'var(--wq-pass)',
        fail: 'var(--wq-fail)',
        dim: 'var(--wq-dim)',
        bright: 'var(--wq-text)',
        accent: 'var(--wq-accent)',
        'on-accent': 'var(--wq-on-accent)',
      },
      fontFamily: {
        pixel: ['FusionPixel', 'ui-monospace', 'SFMono-Regular', 'monospace'],
        word: ['FusionPixel', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        hard: '4px 4px 0 #000',
        'hard-sm': '2px 2px 0 #000',
        'hard-up': '0 -4px 0 #000',
      },
      keyframes: {
        shake: {
          '0%,100%': { transform: 'translateX(0)' },
          '20%': { transform: 'translateX(-4px)' },
          '40%': { transform: 'translateX(4px)' },
          '60%': { transform: 'translateX(-3px)' },
          '80%': { transform: 'translateX(2px)' },
        },
        pop: {
          '0%': { transform: 'scale(.6)', opacity: '0' },
          '60%': { transform: 'scale(1.06)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        blink: {
          '0%,49%': { opacity: '1' },
          '50%,100%': { opacity: '0' },
        },
        floatUp: {
          '0%': { transform: 'translateY(0)', opacity: '1' },
          '100%': { transform: 'translateY(-40px)', opacity: '0' },
        },
        // 单次作者化动效：答对时的一次像素冲击波
        hit: {
          '0%': { transform: 'scale(1)', opacity: '0.9' },
          '100%': { transform: 'scale(1.9)', opacity: '0' },
        },
      },
      animation: {
        shake: 'shake 220ms steps(4, end)',
        pop: 'pop 160ms steps(3, end)',
        blink: 'blink 1s steps(1, end) infinite',
        floatUp: 'floatUp 700ms steps(8, end) forwards',
        hit: 'hit 320ms steps(5, end) forwards',
      },
    },
  },
  plugins: [],
}
