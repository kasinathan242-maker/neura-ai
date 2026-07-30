import React from 'react';
import clsx from 'clsx';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { renderMarkdown } from '../lib/markdown';

/** Shared primitives, so pages stay about behaviour rather than class strings. */

export const Panel = ({ className, children, ...rest }) => (
    <div className={clsx('surface rounded-2xl', className)} {...rest}>
        {children}
    </div>
);

export const PageHeader = ({ title, subtitle, badge, actions }) => (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
            <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-app text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
                {badge}
            </div>
            {subtitle && <p className="text-app-muted mt-1 text-sm">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
);

const VARIANTS = {
    primary:
        'bg-[var(--accent)] text-black hover:brightness-110 disabled:bg-[var(--border-strong)] disabled:text-app-muted',
    ghost: 'border-app border text-app hover:accent-bg disabled:opacity-40',
    subtle: 'accent-bg accent-text hover:brightness-125 disabled:opacity-40',
    danger: 'border border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20 disabled:opacity-40',
};

export const Button = ({
    variant = 'primary',
    size = 'md',
    loading = false,
    icon: Icon,
    className,
    children,
    disabled,
    ...rest
}) => (
    <button
        disabled={disabled || loading}
        className={clsx(
            'focus-ring inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all',
            'active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100',
            size === 'sm' ? 'px-3 py-1.5 text-xs' : size === 'lg' ? 'px-6 py-3 text-base' : 'px-4 py-2 text-sm',
            VARIANTS[variant],
            className,
        )}
        {...rest}
    >
        {loading ? <Loader2 size={16} className="animate-spin" /> : Icon && <Icon size={16} />}
        {children}
    </button>
);

export const TextInput = ({ className, ...rest }) => (
    <input
        className={clsx(
            'surface text-app placeholder:text-app-muted focus-ring w-full rounded-xl px-4 py-2.5 text-sm',
            'transition-colors focus:border-[var(--accent)]',
            className,
        )}
        {...rest}
    />
);

export const TextArea = ({ className, ...rest }) => (
    <textarea
        className={clsx(
            'surface text-app placeholder:text-app-muted focus-ring w-full rounded-xl px-4 py-3 text-sm',
            'resize-y transition-colors focus:border-[var(--accent)]',
            className,
        )}
        {...rest}
    />
);

export const Select = ({ className, children, ...rest }) => (
    <select
        className={clsx(
            'surface text-app focus-ring rounded-xl px-3 py-2 text-sm transition-colors',
            'focus:border-[var(--accent)]',
            className,
        )}
        {...rest}
    >
        {children}
    </select>
);

export const Badge = ({ tone = 'neutral', className, children }) => {
    const tones = {
        neutral: 'border-app border text-app-muted',
        accent: 'accent-bg accent-text border border-[var(--border-strong)]',
        good: 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
        warn: 'border border-amber-500/30 bg-amber-500/10 text-amber-300',
        bad: 'border border-red-500/30 bg-red-500/10 text-red-300',
    };
    return (
        <span
            className={clsx(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
                tones[tone],
                className,
            )}
        >
            {children}
        </span>
    );
};

/** Error state that names the failure and offers the obvious next action. */
export const ErrorNote = ({ error, onRetry, className }) => {
    if (!error) return null;
    return (
        <div
            role="alert"
            className={clsx(
                'flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm',
                className,
            )}
        >
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-red-400" />
            <div className="min-w-0 flex-1">
                <p className="font-medium text-red-300">Something went wrong</p>
                <p className="text-app-muted mt-1 break-words">{String(error)}</p>
            </div>
            {onRetry && (
                <Button variant="ghost" size="sm" icon={RefreshCw} onClick={onRetry}>
                    Retry
                </Button>
            )}
        </div>
    );
};

export const EmptyState = ({ icon: Icon, title, children, action }) => (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
        {Icon && (
            <div className="accent-bg mb-4 flex h-14 w-14 items-center justify-center rounded-2xl">
                <Icon size={26} className="accent-text" />
            </div>
        )}
        <h3 className="text-app text-base font-semibold">{title}</h3>
        {children && <p className="text-app-muted mt-2 max-w-md text-sm">{children}</p>}
        {action && <div className="mt-5">{action}</div>}
    </div>
);

export const Spinner = ({ label, className }) => (
    <div className={clsx('text-app-muted flex items-center justify-center gap-3 py-8 text-sm', className)}>
        <Loader2 size={20} className="accent-text animate-spin" />
        {label}
    </div>
);

export const Progress = ({ value, className }) => (
    <div className={clsx('h-1.5 w-full overflow-hidden rounded-full bg-[var(--border-subtle)]', className)}>
        <div
            className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-500 ease-out"
            style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
    </div>
);

/**
 * Minimal markdown renderer.
 *
 * Purpose-built rather than pulling in a parser: the model output we render is a
 * known subset (headings, lists, fences, inline emphasis), and this keeps the
 * bundle small while escaping HTML before any formatting is applied — so model
 * output can never inject markup.
 */
export const Markdown = ({ text, className }) => {
    const html = React.useMemo(() => renderMarkdown(text || ''), [text]);
    return (
        <div
            className={clsx('md text-app', className)}
            // Safe by construction: renderMarkdown escapes < > & before it emits
            // any tags of its own.
            dangerouslySetInnerHTML={{ __html: html }}
        />
    );
};

/**
 * Stops one broken page from blanking the whole app.
 *
 * Especially relevant for the 3D and camera pages, where a WebGL context loss or
 * a missing device API can throw during render.
 */
export class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { error: null };
    }

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error, info) {
        console.error('Page crashed:', error, info);
    }

    render() {
        if (this.state.error) {
            return (
                <div className="p-6">
                    <ErrorNote
                        error={`${this.state.error.message || this.state.error}`}
                        onRetry={() => this.setState({ error: null })}
                    />
                    <p className="text-app-muted mt-4 text-sm">
                        {this.props.hint ||
                            'This section failed to render. Retry, or use another part of the app.'}
                    </p>
                </div>
            );
        }
        return this.props.children;
    }
}
