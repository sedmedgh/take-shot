import {embedResources} from './embed-resources';
import {toArray, isInstanceOfElement} from './util';
import {isDataUrl, resourceToDataURL} from './dataurl';
import {getMimeType} from './mimes';

async function embedProp(propName: string, node: HTMLElement) {
  const propValue = node.style?.getPropertyValue(propName);
  if (propValue) {
    const cssString = await embedResources(propValue, null);
    node.style.setProperty(propName, cssString, node.style.getPropertyPriority(propName));
    return true;
  }
  return false;
}

async function embedBackground<T extends HTMLElement>(clonedNode: T) {
  if (!(await embedProp('background', clonedNode))) {
    await embedProp('background-image', clonedNode);
  }
  if (!(await embedProp('mask', clonedNode))) {
    await embedProp('mask-image', clonedNode);
  }
}

async function embedImageNode<T extends HTMLElement | SVGImageElement>(clonedNode: T) {
  const isImageElement = isInstanceOfElement(clonedNode, HTMLImageElement);

  if (
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    !(isImageElement && !isDataUrl(clonedNode.src)) &&
    !(isInstanceOfElement(clonedNode, SVGImageElement) && !isDataUrl(clonedNode.href.baseVal))
  ) {
    return;
  }

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const url = isImageElement ? clonedNode.src : clonedNode.href.baseVal;

  const dataURL = await resourceToDataURL(url, getMimeType(url));
  await new Promise((resolve, reject) => {
    clonedNode.onload = resolve;
    clonedNode.onerror = (e) => {
      console.log('e ===>', e);
    };

    const image = clonedNode as HTMLImageElement;
    if (image.decode) {
      image.decode = resolve as any;
    }

    if (image.loading === 'lazy') {
      image.loading = 'eager';
    }

    if (isImageElement) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      clonedNode.srcset = '';
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      clonedNode.src = dataURL;
    } else {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      clonedNode.href.baseVal = dataURL;
    }
  });
}

async function embedChildren<T extends HTMLElement>(clonedNode: T) {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const children = toArray<HTMLElement>(clonedNode.childNodes);
  const deferreds = children.map((child) => embedImages(child));
  await Promise.all(deferreds).then(() => clonedNode);
}

export async function embedImages<T extends HTMLElement>(clonedNode: T) {
  if (isInstanceOfElement(clonedNode, Element)) {
    try{
      await embedBackground(clonedNode);
    }
    catch (e) {
      console.log('embedBackground ===>', e);
    }
    try{
      await embedImageNode(clonedNode);
    }
    catch (e) {
      console.log('embedImageNode ===>', e);
    }
    try{
      await embedChildren(clonedNode);
    }
    catch (e) {
      console.log('embedChildren ===>', e);
    }
  }
}
