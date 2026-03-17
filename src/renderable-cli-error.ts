export const renderableCliErrorBrand: unique symbol = Symbol('renderableCliError');

export interface RenderableCliError {
  readonly [renderableCliErrorBrand]: true;
  render(): string;
}

export function isRenderableCliError(error: unknown): error is RenderableCliError {
  return typeof error === 'object'
    && error !== null
    && renderableCliErrorBrand in error
    && error[renderableCliErrorBrand] === true
    && 'render' in error
    && typeof error.render === 'function';
}
