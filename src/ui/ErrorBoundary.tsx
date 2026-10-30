import { Component, type ErrorInfo, type ReactNode } from 'react'
import { PixelButton } from '../ui/Pixel'
import { Icon } from '../ui/icons'

interface Props {
  children: ReactNode
  /** 出错时的兜底文案 */
  label?: string
  /** 页面切换时解除旧页面的错误。 */
  resetKey?: string
  onReset?: () => void
  onExit?: () => void
  exitLabel?: string
}

interface State {
  error: Error | null
}

/**
 * 页面级错误边界：单个查询失败不应让整页白屏。
 * 离线 App 里数据库可能正在初始化（首次导入词库），
 * 抛出的是可重试的瞬时错误。
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[WordQuest] 渲染失败', error, info.componentStack)
  }

  componentDidUpdate(previous: Props) {
    if (this.state.error && previous.resetKey !== this.props.resetKey) {
      this.setState({ error: null })
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 p-6 text-center" role="alert">
          <span className="text-fail"><Icon name="warning" size={32} /></span>
          <div className="text-px12 text-fail">{this.props.label ?? '这一页出了点问题'}</div>
          <p className="readable max-w-sm text-px12 text-dim">请重试载入页面。如仍无法打开，可重新载入应用。</p>
          <div className="flex flex-wrap justify-center gap-2">
            <PixelButton variant="primary" onClick={() => {
              this.props.onReset?.()
              this.setState({ error: null })
            }}>重试载入</PixelButton>
            {this.props.onExit && <PixelButton onClick={this.props.onExit}>{this.props.exitLabel ?? '返回'}</PixelButton>}
            <PixelButton variant="ghost" onClick={() => window.location.reload()}>重新载入应用</PixelButton>
          </div>
          <details className="readable w-full max-w-sm text-left text-px12 text-dim">
            <summary className="cursor-pointer">查看错误详情</summary>
            <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-words border-2 border-edge bg-panel p-2">
              {this.state.error.message}
            </pre>
          </details>
        </div>
      )
    }
    return this.props.children
  }
}
