import {
  isBodyElement,
  isCanvasElement,
  isCustomElement,
  isElementNode,
  isHTMLElementNode,
  isIFrameElement,
  isImageElement,
  isScriptElement,
  isSelectElement,
  isSlotElement,
  isStyleElement,
  isSVGElementNode,
  isTextareaElement,
  isTextNode,
  isVideoElement
} from './node-parser'
import {isIdentToken, nonFunctionArgSeparator} from '../css/syntax/parser'
import {TokenType} from '../css/syntax/tokenizer'
import {CounterState, createCounterText} from '../css/types/functions/counter'
import {LIST_STYLE_TYPE, listStyleType} from '../css/property-descriptors/list-style-type'
import {CSSParsedCounterDeclaration, CSSParsedPseudoDeclaration} from '../css/index'
import {getQuote} from '../css/property-descriptors/quotes'
import {Context} from '../core/context'
import {DebuggerType, isDebugging} from '../core/debugger'
import {CSSRuleSelector, embedWebFonts, FilterFontFace, injectCssRules} from './extra/embed-webfonts'
import {embedImages} from './extra/embed-images'
import {toArray} from './extra/util'

export interface CloneOptions {
  ignoreElements?: (element: Element) => boolean
  onclone?: (document: Document, element: HTMLElement) => void
  allowTaint?: boolean
}

export interface WindowOptions {
  scrollX: number
  scrollY: number
  windowWidth: number
  windowHeight: number
}

export type CloneConfigurations = CloneOptions & {
  inlineImages: boolean
  cssRuleSelector?: CSSRuleSelector
}

const IGNORE_ATTRIBUTE = 't-sh-ignore'
const invalidTags = ['SCRIPT', 'META', 'LINK', 'STYLE', 'TITLE', 'PLASMO-CSUI']

const fakeScroll = (clone: Node, y: number, x: number) => {
  if (y !== 0 || x !== 0) {
    // @ts-ignore
    const children = toArray<ChildNode>(clone.childNodes)
    const body = children.find((ch) => ch.nodeName == 'BODY')
    if (body) fakeScroll(body, y, x)
    else {
      const scrolledNodes = children.filter(
          // @ts-ignore
          (ch) => ![...invalidTags, '#text'].includes(ch.nodeName) && !['fixed', 'absolute'].includes(ch?.style?.position)
      )
      // @ts-ignore
      clone.style.position = 'relative'
      // @ts-ignore
      clone.style.overflow = 'hidden'
      if (scrolledNodes.length > 0) {
        // @ts-ignore
        let right = clone.style.direction === 'rtl' ? `${x}px` : 0
        // @ts-ignore
        let left = clone.style.direction === 'ltr' ? `${-x}px` : 0
        const inset = `${-y}px ${right} 0 ${left}`
        if (scrolledNodes.length === 1) {
          // @ts-ignore
          scrolledNodes[0].style.position = 'absolute'
          // @ts-ignore
          scrolledNodes[0].style.inset = inset
        } else {
          const section = document.createElement('section')
          // @ts-ignore
          copyCSSStyles(clone.style, section)
          section.style.inset = inset
          section.style.position = 'absolute'
          section.style.inlineSize = 'unset'
          section.style.blockSize = 'unset'
          section.style.height = 'unset'
          section.style.width = 'unset'
          scrolledNodes.forEach((ch) => {
            section.appendChild(ch.cloneNode(true))
            ch.remove()
          })
          clone.appendChild(section)
        }
      }
    }
  }
}
export class DocumentCloner {
  documentElement: HTMLElement
  private readonly counters: CounterState
  private quoteDepth: number

  constructor(
    private readonly context: Context,
    element: HTMLElement,
    private readonly options: CloneConfigurations
  ) {
    this.counters = new CounterState()
    this.quoteDepth = 0
    if (!element.ownerDocument) {
      throw new Error('Cloned element does not have an owner document')
    }

    this.documentElement = this.cloneNode(element, false) as HTMLElement
    // const yourDOCTYPE = "<!DOCTYPE html..."; // your doctype declaration
    // const printPreview = window.open('about:blank', 'print_preview');
    // const printDocument = printPreview.document;
    // printDocument.open();
    // printDocument.write(yourDOCTYPE+ this.documentElement.innerHTML);
    // printDocument.close()
    injectCssRules(this.documentElement, options.cssRuleSelector)
  }
  async embed(filterFontFace?: FilterFontFace, placeholder?: string) {
    await embedWebFonts(this.documentElement, filterFontFace)
    await embedImages(this.documentElement, placeholder)
  }

  createElementClone<T extends HTMLElement | SVGElement>(node: T): HTMLElement | SVGElement {
    if (isDebugging(node, DebuggerType.CLONE)) {
      debugger
    }
    if (isCanvasElement(node)) {
      return this.createCanvasClone(node)
    }
    if (isVideoElement(node)) {
      return this.createVideoClone(node)
    }
    if (isStyleElement(node)) {
      return this.createStyleClone(node)
    }

    const clone = node.cloneNode(false) as T
    if (isImageElement(clone)) {
      if (isImageElement(node) && node.currentSrc && node.currentSrc !== node.src) {
        clone.src = node.currentSrc
        clone.srcset = ''
      }

      if (clone.loading === 'lazy') {
        clone.loading = 'eager'
      }
    }

    if (isCustomElement(clone)) {
      return this.createCustomElementClone(clone)
    }

    return clone
  }

  createCustomElementClone(node: HTMLElement): HTMLElement {
    const clone = document.createElement('hcanvasercustomelement')
    copyCSSStyles(node.style, clone)

    return clone
  }

  createStyleClone(node: HTMLStyleElement): HTMLStyleElement {
    try {
      const sheet = node.sheet as CSSStyleSheet | undefined
      if (sheet && sheet.cssRules) {
        const css: string = [].slice.call(sheet.cssRules, 0).reduce((css: string, rule: CSSRule) => {
          if (rule && typeof rule.cssText === 'string') {
            return css + rule.cssText
          }
          return css
        }, '')
        const style = node.cloneNode(false) as HTMLStyleElement
        style.textContent = css
        return style
      }
    } catch (e) {
      // accessing node.sheet.cssRules throws a DOMException
      this.context.logger.error('Unable to access cssRules property', e)
      if (e.name !== 'SecurityError') {
        throw e
      }
    }
    return node.cloneNode(false) as HTMLStyleElement
  }

  createCanvasClone(canvas: HTMLCanvasElement): HTMLImageElement | HTMLCanvasElement {
    if (this.options.inlineImages && canvas.ownerDocument) {
      const img = canvas.ownerDocument.createElement('img')
      try {
        img.src = canvas.toDataURL()
        return img
      } catch (e) {
        this.context.logger.info(`Unable to inline canvas contents, canvas is tainted`, canvas)
      }
    }

    const clonedCanvas = canvas.cloneNode(false) as HTMLCanvasElement

    try {
      clonedCanvas.width = canvas.width
      clonedCanvas.height = canvas.height
      const ctx = canvas.getContext('2d')
      const clonedCtx = clonedCanvas.getContext('2d')
      if (clonedCtx) {
        if (!this.options.allowTaint && ctx) {
          clonedCtx.putImageData(ctx.getImageData(0, 0, canvas.width, canvas.height), 0, 0)
        } else {
          const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
          if (gl) {
            const attribs = gl.getContextAttributes()
            if (attribs?.preserveDrawingBuffer === false) {
              this.context.logger.warn('Unable to clone WebGL context as it has preserveDrawingBuffer=false', canvas)
            }
          }

          clonedCtx.drawImage(canvas, 0, 0)
        }
      }
      return clonedCanvas
    } catch (e) {
      this.context.logger.info(`Unable to clone canvas as it is tainted`, canvas)
    }

    return clonedCanvas
  }

  createVideoClone(video: HTMLVideoElement): HTMLCanvasElement {
    const canvas = video.ownerDocument.createElement('canvas')

    canvas.width = video.offsetWidth
    canvas.height = video.offsetHeight
    const ctx = canvas.getContext('2d')

    try {
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        if (!this.options.allowTaint) {
          ctx.getImageData(0, 0, canvas.width, canvas.height)
        }
      }
      return canvas
    } catch (e) {
      this.context.logger.info(`Unable to clone video as it is tainted`, video)
    }

    const blankCanvas = video.ownerDocument.createElement('canvas')

    blankCanvas.width = video.offsetWidth
    blankCanvas.height = video.offsetHeight
    return blankCanvas
  }

  isVisible(style?: CSSStyleDeclaration): boolean {
    if (style?.display == 'none' || style?.visibility == 'hidden' || style?.opacity == '0') return false
    return true
  }

  appendChildNode(clone: HTMLElement | SVGElement, child: Node, copyStyles: boolean): void {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    if (!this.isVisible(child.style)) return
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    if (invalidTags.includes(child.tagName) || child.nodeType == 8) return
    if (
      !isElementNode(child) ||
      (!isScriptElement(child) &&
        !child.hasAttribute(IGNORE_ATTRIBUTE) &&
        (typeof this.options.ignoreElements !== 'function' || !this.options.ignoreElements(child)))
    ) {
      if (!isElementNode(child) || !isStyleElement(child)) {
        clone.appendChild(this.cloneNode(child, copyStyles))
      }
    }
  }

  cloneChildNodes(node: Element, clone: HTMLElement | SVGElement, copyStyles: boolean): void {
    for (let child = node.shadowRoot ? node.shadowRoot.firstChild : node.firstChild; child; child = child.nextSibling) {
      if (isElementNode(child) && isSlotElement(child) && typeof child.assignedNodes === 'function') {
        const assignedNodes = child.assignedNodes() as ChildNode[]
        if (assignedNodes.length) {
          assignedNodes.forEach((assignedNode) => this.appendChildNode(clone, assignedNode, copyStyles))
        }
      } else {
        this.appendChildNode(clone, child, copyStyles)
      }
    }
  }

  cloneNode(node: Node, copyStyles: boolean): Node {
    if (isTextNode(node)) {
      return document.createTextNode(node.data)
    }

    if (!node.ownerDocument) {
      return node.cloneNode(false)
    }

    const window = node.ownerDocument.defaultView

    if (window && isElementNode(node) && (isHTMLElementNode(node) || isSVGElementNode(node))) {
      const clone = this.createElementClone(node)
      clone.style.transitionProperty = 'none'

      const style = window.getComputedStyle(node)
      const styleBefore = window.getComputedStyle(node, ':before')
      const styleAfter = window.getComputedStyle(node, ':after')

      if (isBodyElement(clone)) {
        createPseudoHideStyles(clone)
      }

      const counters = this.counters.parse(new CSSParsedCounterDeclaration(this.context, style))

      if (isCustomElement(node)) {
        copyStyles = true
      }

      if (!isVideoElement(node)) {
        this.cloneChildNodes(node, clone, copyStyles)
      }

      const before = this.resolvePseudoContent(node, clone, styleBefore, PseudoElementType.BEFORE)
      if (before && this.isVisible(styleBefore)) {
        clone.insertBefore(before, clone.firstChild)
      }

      const after = this.resolvePseudoContent(node, clone, styleAfter, PseudoElementType.AFTER)
      if (after && this.isVisible(styleAfter)) {
        clone.appendChild(after)
      }

      this.counters.pop(counters)

      if ((style && !isIFrameElement(node)) || copyStyles) {
        copyCSSStyles(style, clone)
      }

      fakeScroll(clone, node.scrollTop, node.scrollLeft)

      if ((isTextareaElement(node) || isSelectElement(node)) && (isTextareaElement(clone) || isSelectElement(clone))) {
        clone.value = node.value
      }

      return clone
    }

    return node.cloneNode(false)
  }

  resolvePseudoContent(
    node: Element,
    clone: Element,
    style: CSSStyleDeclaration,
    pseudoElt: PseudoElementType
  ): HTMLElement | void {
    if (!style) {
      return
    }

    const value = style.content
    const document = clone.ownerDocument
    if (!document || !value || value === 'none' || value === '-moz-alt-content' || style.display === 'none') {
      return
    }

    this.counters.parse(new CSSParsedCounterDeclaration(this.context, style))
    const declaration = new CSSParsedPseudoDeclaration(this.context, style)

    const anonymousReplacedElement = document.createElement('t-sh-pseudo-element')
    copyCSSStyles(style, anonymousReplacedElement)

    declaration.content.forEach((token) => {
      if (token.type === TokenType.STRING_TOKEN) {
        anonymousReplacedElement.appendChild(document.createTextNode(token.value))
      } else if (token.type === TokenType.URL_TOKEN) {
        const img = document.createElement('img')
        img.src = token.value
        img.style.opacity = '1'
        anonymousReplacedElement.appendChild(img)
      } else if (token.type === TokenType.FUNCTION) {
        if (token.name === 'attr') {
          const attr = token.values.filter(isIdentToken)
          if (attr.length) {
            anonymousReplacedElement.appendChild(document.createTextNode(node.getAttribute(attr[0].value) || ''))
          }
        } else if (token.name === 'counter') {
          const [counter, counterStyle] = token.values.filter(nonFunctionArgSeparator)
          if (counter && isIdentToken(counter)) {
            const counterState = this.counters.getCounterValue(counter.value)
            const counterType =
              counterStyle && isIdentToken(counterStyle)
                ? listStyleType.parse(this.context, counterStyle.value)
                : LIST_STYLE_TYPE.DECIMAL

            anonymousReplacedElement.appendChild(
              document.createTextNode(createCounterText(counterState, counterType, false))
            )
          }
        } else if (token.name === 'counters') {
          const [counter, delim, counterStyle] = token.values.filter(nonFunctionArgSeparator)
          if (counter && isIdentToken(counter)) {
            const counterStates = this.counters.getCounterValues(counter.value)
            const counterType =
              counterStyle && isIdentToken(counterStyle)
                ? listStyleType.parse(this.context, counterStyle.value)
                : LIST_STYLE_TYPE.DECIMAL
            const separator = delim && delim.type === TokenType.STRING_TOKEN ? delim.value : ''
            const text = counterStates.map((value) => createCounterText(value, counterType, false)).join(separator)

            anonymousReplacedElement.appendChild(document.createTextNode(text))
          }
        } else {
          //   console.log('FUNCTION_TOKEN', token);
        }
      } else if (token.type === TokenType.IDENT_TOKEN) {
        switch (token.value) {
          case 'open-quote':
            anonymousReplacedElement.appendChild(
              document.createTextNode(getQuote(declaration.quotes, this.quoteDepth++, true))
            )
            break
          case 'close-quote':
            anonymousReplacedElement.appendChild(
              document.createTextNode(getQuote(declaration.quotes, --this.quoteDepth, false))
            )
            break
          default:
            // safari doesn't parse string tokens correctly because of lack of quotes
            anonymousReplacedElement.appendChild(document.createTextNode(token.value))
        }
      }
    })

    anonymousReplacedElement.className = `${PSEUDO_HIDE_ELEMENT_CLASS_BEFORE} ${PSEUDO_HIDE_ELEMENT_CLASS_AFTER}`
    const newClassName =
      pseudoElt === PseudoElementType.BEFORE
        ? ` ${PSEUDO_HIDE_ELEMENT_CLASS_BEFORE}`
        : ` ${PSEUDO_HIDE_ELEMENT_CLASS_AFTER}`

    if (isSVGElementNode(clone)) {
      clone.className.baseValue += newClassName
    } else {
      clone.className += newClassName
    }

    return anonymousReplacedElement
  }

  static destroy(container: HTMLIFrameElement): boolean {
    if (container.parentNode) {
      container.parentNode.removeChild(container)
      return true
    }
    return false
  }
}

enum PseudoElementType {
  BEFORE,
  AFTER
}

const ignoredStyleProperties = [
  'all', // #2476
  'd', // #2483
  'content' // Safari shows pseudoelements if content is set
]

export const copyCSSStyles = <T extends HTMLElement | SVGElement>(style: CSSStyleDeclaration, target: T): T => {
  // Edge does not provide value for cssText
  for (let i = style.length - 1; i >= 0; i--) {
    const property = style.item(i)
    if (ignoredStyleProperties.indexOf(property) === -1) {
      target.style.setProperty(property, style.getPropertyValue(property))
    }
  }
  return target
}

const PSEUDO_BEFORE = ':before'
const PSEUDO_AFTER = ':after'
const PSEUDO_HIDE_ELEMENT_CLASS_BEFORE = '___take-shot___pseudoelement_before'
const PSEUDO_HIDE_ELEMENT_CLASS_AFTER = '___take-shot___pseudoelement_after'

const PSEUDO_HIDE_ELEMENT_STYLE = `{
    content: "" !important;
    display: none !important;
}`

const createPseudoHideStyles = (body: HTMLElement) => {
  createStyles(
    body,
    `.${PSEUDO_HIDE_ELEMENT_CLASS_BEFORE}${PSEUDO_BEFORE}${PSEUDO_HIDE_ELEMENT_STYLE}
         .${PSEUDO_HIDE_ELEMENT_CLASS_AFTER}${PSEUDO_AFTER}${PSEUDO_HIDE_ELEMENT_STYLE}`
  )
}

const createStyles = (body: HTMLElement, styles: string) => {
  const document = body.ownerDocument
  if (document) {
    const style = document.createElement('style')
    style.textContent = styles
    body.appendChild(style)
  }
}
