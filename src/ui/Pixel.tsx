import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Icon, type IconName } from './icons'

export function Panel({
  children,
  className = '',
  onClick,
  as = 'div',
}: {
  children: ReactNode
  className?: string
  onClick?: () => void
  as?: 'div' | 'section' | 'li'
}) {
  const Tag = as
  return (
    <Tag
      onClick={onClick}
      className={`pixel-frame bg-panel p-3 ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      {children}
    </Tag>
  )
}

export function PixelButton({
  children,
  onClick,
  variant = 'default',
  disabled,
  className = '',
  type = 'button',
  size = 'md',
  icon,
  ariaLabel,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'primary' | 'pass' | 'fail' | 'ghost'
  size?: 'md' | 'sm'
  icon?: IconName
  ariaLabel?: string
}) {
  const v =
    variant === 'primary'
      ? 'pixel-btn-primary'
      : variant === 'pass'
        ? 'pixel-btn-pass'
        : variant === 'fail'
          ? 'pixel-btn-fail'
          : variant === 'ghost'
            ? 'pixel-btn-ghost'
            : ''
  const sizing = size === 'sm' ? 'pixel-btn-sm' : 'px-4 py-2'
  return (
    <button
      {...props}
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel ?? props['aria-label']}
      className={`pixel-btn ${v} ${sizing} inline-flex items-center justify-center gap-2 whitespace-nowrap ${className}`}
    >
      {icon && <Icon name={icon} size={16} />}
      {children}
    </button>
  )
}

export function PixelBar({
  value,
  max,
  color,
  className = '',
  label,
}: {
  value: number
  max: number
  color?: string
  className?: string
  label?: string
}) {
  const safeMax = Number.isFinite(max) ? Math.max(1, max) : 1
  const safeValue = Number.isFinite(value) ? Math.min(safeMax, Math.max(0, value)) : 0
  const pct = (safeValue / safeMax) * 100
  return (
    <div
      className={`pixel-bar ${className}`}
      role="progressbar"
      aria-valuenow={Math.round(safeValue)}
      aria-valuemin={0}
      aria-valuemax={Math.round(safeMax)}
      aria-label={label ?? '学习进度'}
    >
      <i style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

/**
 * 分区标题：不用 uppercase eyebrow 小标签（那是模板感的头号来源），
 * 用一条硬分隔线 + 与正文同级的标题，让标题自己承担层级。
 */
export function SectionHead({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="section-head">
      <h2 className="text-px12 text-bright">{children}</h2>
      {right && <div className="text-px12 text-dim">{right}</div>}
    </div>
  )
}

/** 像素吉祥物：16×16 简化形象，随段位换形态（§7.2） */
export function Mascot({
  stage,
  size = 72,
  mood = 'idle',
  skin = 'default',
}: {
  stage: string
  size?: number
  mood?: 'idle' | 'happy' | 'sad'
  /** 商店购买的皮肤：leaf / crown */
  skin?: string
}) {
  const palettes: Record<string, { body: string; eye: string }> = {
    蛋: { body: '#e8e8f5', eye: '#16162a' },
    幼年体: { body: '#3cdb6f', eye: '#0d0d1a' },
    少年体: { body: '#6d9bff', eye: '#0d0d1a' },
    成年体: { body: '#ffe845', eye: '#0d0d1a' },
    披风形态: { body: '#b98cff', eye: '#0d0d1a' },
    光环形态: { body: '#45f5d0', eye: '#0d0d1a' },
    传说形态: { body: '#ff8fc0', eye: '#0d0d1a' },
  }
  const p = palettes[stage] ?? palettes['蛋']
  const eyeY = mood === 'happy' ? 8 : 7
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      className={mood === 'sad' ? 'animate-shake' : ''}
      role="img"
      aria-label={`吉祥物 ${stage}`}
    >
      <rect x="4" y="3" width="8" height="9" fill={p.body} />
      <rect x="3" y="5" width="10" height="6" fill={p.body} />
      <rect x="5" y="12" width="2" height="2" fill={p.body} />
      <rect x="9" y="12" width="2" height="2" fill={p.body} />
      <rect x="6" y={eyeY} width="1" height="2" fill={p.eye} />
      <rect x="9" y={eyeY} width="1" height="2" fill={p.eye} />
      {mood === 'happy' ? (
        <>
          <rect x="7" y="10" width="2" height="1" fill={p.eye} />
          <rect x="6" y="9" width="1" height="1" fill={p.eye} />
          <rect x="9" y="9" width="1" height="1" fill={p.eye} />
        </>
      ) : mood === 'sad' ? (
        <rect x="7" y="10" width="2" height="1" fill={p.eye} opacity="0.6" />
      ) : (
        <rect x="7" y="10" width="2" height="1" fill={p.eye} opacity="0.5" />
      )}
      {/* 皮肤装饰 */}
      {skin === 'leaf' && (
        <>
          <rect x="8" y="0" width="2" height="1" fill="#3cdb6f" />
          <rect x="9" y="1" width="2" height="1" fill="#3cdb6f" />
          <rect x="7" y="1" width="1" height="2" fill="#2fb862" />
        </>
      )}
      {skin === 'crown' && (
        <>
          <rect x="5" y="1" width="6" height="1" fill="#ffe845" />
          <rect x="5" y="2" width="1" height="1" fill="#ffe845" />
          <rect x="7" y="2" width="2" height="1" fill="#ffe845" />
          <rect x="10" y="2" width="1" height="1" fill="#ffe845" />
        </>
      )}
      {stage === '光环形态' && <rect x="4" y="1" width="8" height="1" fill="#ffe845" />}
      {stage === '传说形态' && (
        <>
          <rect x="4" y="1" width="2" height="1" fill="#ffe845" />
          <rect x="7" y="0" width="2" height="1" fill="#ffe845" />
          <rect x="10" y="1" width="2" height="1" fill="#ffe845" />
        </>
      )}
    </svg>
  )
}

/**
 * 像素怪物：单词难度化身（§7.2）。
 *
 * 重量 1.0 = 史莱姆（绿），1.3 = 中怪（红），1.6+ = BOSS（紫、放大、戴王冠）。
 * dying 时播碎裂动画，靠外层在约 500ms 后换下一只。
 */
export function Monster({
  weight,
  dead,
  dying,
  size,
}: {
  weight: number
  dead?: boolean
  dying?: boolean
  size?: number
}) {
  const isBoss = weight >= 1.6
  const isMid = weight >= 1.3 && !isBoss
  const body = dead ? '#4a4a66' : isBoss ? '#b98cff' : isMid ? '#ff7b8a' : '#3cdb6f'
  const px = isBoss ? Math.round((size ?? 72) * 1.35) : (size ?? 72)
  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 18 18"
      shapeRendering="crispEdges"
      className={`anim-bob ${dying ? 'anim-die' : ''}`}
      role="img"
      aria-label={isBoss ? 'BOSS 怪物' : '怪物'}
    >
      {isBoss && (
        <>
          {/* 王冠与双角 */}
          <rect x="4" y="0" width="2" height="2" fill="#ffe845" />
          <rect x="7" y="0" width="2" height="2" fill="#ffe845" />
          <rect x="10" y="0" width="2" height="2" fill="#ffe845" />
          <rect x="4" y="2" width="8" height="1" fill="#ffe845" />
          <rect x="4" y="3" width="1" height="1" fill={body} />
          <rect x="13" y="3" width="1" height="1" fill={body} />
        </>
      )}
      <rect x="4" y="4" width="10" height="9" fill={body} />
      <rect x="3" y="6" width="12" height="5" fill={body} />
      {!dead && !dying ? (
        <>
          <rect x="6" y="7" width="2" height="2" fill="#0d0d1a" />
          <rect x="10" y="7" width="2" height="2" fill="#0d0d1a" />
          <rect x="7" y="11" width="4" height="1" fill="#0d0d1a" />
        </>
      ) : (
        <>
          <rect x="6" y="7" width="1" height="1" fill="#0d0d1a" />
          <rect x="7" y="8" width="1" height="1" fill="#0d0d1a" />
          <rect x="10" y="7" width="1" height="1" fill="#0d0d1a" />
          <rect x="11" y="8" width="1" height="1" fill="#0d0d1a" />
        </>
      )}
      <rect x="5" y="13" width="2" height="2" fill={body} />
      <rect x="11" y="13" width="2" height="2" fill={body} />
    </svg>
  )
}

/**
 * 结算宝箱：先抖动，open=true 时开盖、金币飞出。
 * 阶段由父组件控制：mount 后先 shake，约 800ms 后置 open。
 */
export function Chest({ open, size = 72 }: { open: boolean; size?: number }) {
  return (
    <div
      className={`relative ${!open ? 'anim-chestshake' : ''}`}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 18 18"
        shapeRendering="crispEdges"
        role="img"
        aria-label={open ? '已打开的宝箱' : '宝箱'}
      >
        {/* 箱体 */}
        <rect x="3" y="8" width="12" height="7" fill="#8b6b3d" />
        <rect x="3" y="8" width="12" height="1" fill="#6b5230" />
        <rect x="8" y="10" width="2" height="3" fill="#ffe845" />
        {/* 箱盖：绕左下铰链开 */}
        <g className={open ? 'anim-lidopen' : ''} style={{ transformOrigin: '3px 9px' }}>
          <rect x="3" y="4" width="12" height="4" fill="#a3814c" />
          <rect x="3" y="7" width="12" height="1" fill="#6b5230" />
        </g>
      </svg>
      {open &&
        [0, 1, 2].map((i) => (
          <span
            key={i}
            className="anim-coin absolute left-1/2 top-1/3 block h-2 w-2 border border-black"
            style={{
              background: 'var(--wq-gold)',
              ['--dx' as string]: `${(i - 1) * 18}px`,
              animationDelay: `${i * 90}ms`,
            }}
            aria-hidden
          />
        ))}
    </div>
  )
}

/** 空状态：构图而非一行灰字（§4.5） */
export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon: IconName
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
      <span className="text-dim opacity-60">
        <Icon name={icon} size={32} />
      </span>
      <div className="text-px12 text-bright">{title}</div>
      {hint && <p className="readable max-w-[32ch] text-px12 text-dim">{hint}</p>}
      {action}
    </div>
  )
}
