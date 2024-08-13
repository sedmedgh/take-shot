import {Bounds, parseBounds, parseDocumentSize} from './css/layout/bounds'
import {COLORS, isTransparent, parseColor} from './css/types/color'
import {CloneConfigurations, CloneOptions, DocumentCloner, WindowOptions} from './dom/document-cloner'
import {isBodyElement, isHTMLElement} from './dom/node-parser'
import {CacheStorage} from './core/cache-storage'
import {RenderConfigurations, RenderOptions} from './render/canvas/canvas-renderer'
import {ForeignObjectRenderer} from './render/canvas/foreignobject-renderer'
import {Context, ContextOptions} from './core/context'
import {CSSRuleSelector, FilterFontFace} from './dom/extra/embed-webfonts'

type ImageTypes = 'image/png' | 'image/jpeg' | 'image/webp'
const imageMap: Record<string, ImageTypes> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp'
}
type ImageType = keyof typeof imageMap
export type Options = CloneOptions &
  WindowOptions &
  RenderOptions &
  ContextOptions & {
    backgroundColor: string | null
    filterFontFace?: FilterFontFace
    cssRuleSelector?: CSSRuleSelector
    type?: ImageType
    quality?: number
    imagePlaceholder?: string
  }

const takeShot = (element: HTMLElement, options: Partial<Options> = {}): Promise<string | undefined> => {
  return renderElement(element, options)
}

export default takeShot

if (typeof window !== 'undefined') {
  CacheStorage.setContext(window)
}

const renderElement = async (element: HTMLElement, opts: Partial<Options>): Promise<string | undefined> => {
  if (!element || typeof element !== 'object') {
    return Promise.reject('Invalid element provided as first argument')
  }
  const ownerDocument = element.ownerDocument

  if (!ownerDocument) {
    throw new Error(`Element is not attached to a Document`)
  }

  const defaultView = ownerDocument.defaultView

  if (!defaultView) {
    throw new Error(`Document is not attached to a Window`)
  }

  const resourceOptions = {
    allowTaint: opts.allowTaint ?? false,
    imageTimeout: opts.imageTimeout ?? 15000
  }

  const contextOptions = {
    logging: opts.logging ?? true,
    ...resourceOptions
  }

  const windowOptions = {
    windowWidth: opts.windowWidth ?? defaultView.innerWidth,
    windowHeight: opts.windowHeight ?? defaultView.innerHeight,
    scrollX: opts.scrollX ?? defaultView.pageXOffset,
    scrollY: opts.scrollY ?? defaultView.pageYOffset
  }

  const windowBounds = new Bounds(
    windowOptions.scrollX,
    windowOptions.scrollY,
    windowOptions.windowWidth,
    windowOptions.windowHeight
  )

  const context = new Context(contextOptions, windowBounds)

  const cloneOptions: CloneConfigurations = {
    allowTaint: opts.allowTaint ?? false,
    onclone: opts.onclone,
    ignoreElements: opts.ignoreElements,
    cssRuleSelector: opts.cssRuleSelector,
    inlineImages: true
  }

  context.logger.debug(
    `Starting document clone with size ${windowBounds.width}x${
      windowBounds.height
    } scrolled to ${-windowBounds.left},${-windowBounds.top}`
  )

  const documentCloner = new DocumentCloner(context, element, cloneOptions)
  const clonedElement = documentCloner.documentElement
  if (!clonedElement) {
    return Promise.reject(`Unable to find element in cloned iframe`)
  }
  const imagePlaceholder = opts.imagePlaceholder || 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'36\' height=\'36\' viewBox=\'0 0 36 36\' fill=\'none\' stroke-width=\'1.5\'%3E%3Crect width=\'36\' height=\'36\' fill=\'white\'/%3E%3Cpath d=\'M20 15.3333H20.0067M12 20.6667L15.3333 17.3333C15.952 16.738 16.7147 16.738 17.3333 17.3333L20.6667 20.6667M19.3333 19.3333L20 18.6667C20.6187 18.0713 21.3813 18.0713 22 18.6667L24 20.6667M12 14C12 13.4696 12.2107 12.9609 12.5858 12.5858C12.9609 12.2107 13.4696 12 14 12H22C22.5304 12 23.0391 12.2107 23.4142 12.5858C23.7893 12.9609 24 13.4696 24 14V22C24 22.5304 23.7893 23.0391 23.4142 23.4142C23.0391 23.7893 22.5304 24 22 24H14C13.4696 24 12.9609 23.7893 12.5858 23.4142C12.2107 23.0391 12 22.5304 12 22V14Z\' stroke=\'%233B3C40\' stroke-linecap=\'round\' stroke-linejoin=\'round\'/%3E%3C/svg%3E';
  await documentCloner.embed(opts.filterFontFace, imagePlaceholder)
  const {width, height, left, top} =
    isBodyElement(clonedElement) || isHTMLElement(clonedElement)
      ? parseDocumentSize(clonedElement.ownerDocument)
      : parseBounds(context, clonedElement)

  const backgroundColor = parseBackgroundColor(context, clonedElement, opts.backgroundColor)

  const renderOptions: RenderConfigurations = {
    canvas: opts.canvas,
    backgroundColor,
    scale: opts.scale ?? defaultView.devicePixelRatio ?? 1,
    x: (opts.x ?? 0) + left,
    y: (opts.y ?? 0) + top,
    width: opts.width ?? Math.ceil(width),
    height: opts.height ?? Math.ceil(height)
  }

  const renderer = new ForeignObjectRenderer(context, renderOptions)
  const canvas = await renderer.render(clonedElement)

  context.logger.debug(`Finished rendering`)
  const toImage = (type?: ImageType, quality?: number) => {
    const _type = type ? imageMap[type] : undefined
    const _quality = quality && typeof quality === 'number' && quality > 0.9 ? 0.9 : quality
    if (_type) return canvas.toDataURL(_type, _quality)
  }
  return toImage(opts.type, opts.quality)
}

const parseBackgroundColor = (context: Context, element: HTMLElement, backgroundColorOverride?: string | null) => {
  const ownerDocument = element.ownerDocument
  // http://www.w3.org/TR/css3-background/#special-backgrounds
  const documentBackgroundColor = ownerDocument.documentElement
    ? parseColor(context, getComputedStyle(ownerDocument.documentElement).backgroundColor as string)
    : COLORS.TRANSPARENT
  const bodyBackgroundColor = ownerDocument.body
    ? parseColor(context, getComputedStyle(ownerDocument.body).backgroundColor as string)
    : COLORS.TRANSPARENT

  const defaultBackgroundColor =
    typeof backgroundColorOverride === 'string'
      ? parseColor(context, backgroundColorOverride)
      : backgroundColorOverride === null
        ? COLORS.TRANSPARENT
        : 0xffffffff

  return element === ownerDocument.documentElement
    ? isTransparent(documentBackgroundColor)
      ? isTransparent(bodyBackgroundColor)
        ? defaultBackgroundColor
        : bodyBackgroundColor
      : documentBackgroundColor
    : defaultBackgroundColor
}
