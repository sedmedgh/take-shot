import axios from 'axios';
import {getMimeType} from './mimes';

function getContentFromDataUrl(dataURL: string) {
  return dataURL.split(/,/)[1]
}

export function isDataUrl(url: string) {
  return url.search(/^(data:)/) !== -1
}

export function makeDataUrl(content: string, mimeType: string) {
  return `data:${mimeType};base64,${content}`
}

export async function fetchAsDataURL<T>(
  url: string,
  process: (data: {result: string; res: Response}) => T
): Promise<T> {
  const failPromise =(uri?:string)=>  new Promise<T>((resolve) => {
    resolve((uri || url) as T)
  })
  try {
    const res = await axios({
      url,
      method: 'get',
      // responseType: 'arraybuffer',
      // headers:{
      //   origin: window.location.origin,
      //   host: window.location.host,
      //   // mode: 'no-cors',
      //   'Access-Control-Allow-Origin': '*',
      //  'Content-Type':  '*',
      //   Connection: 'keep-alive',
      //   'Access-Control-Allow-Headers': '*',
      //   'Access-Control-Allow-Credentials': 'true'
      // },
      // credentials: "same-origin",
      // xhr: {
      //   withCredentials: true
      // },
    })
    if (res.status === 404) {
      return failPromise('')
    }
    const blob = new Blob([res.data])
    return new Promise<T>((resolve, reject) => {
      const reader = new FileReader()
      reader.onerror = reject
      reader.onloadend = () => {
        try {
          resolve(process({res, result: reader.result as string}))
        } catch (error) {
          reject(error)
        }
      }

      reader.readAsDataURL(blob)
    })
  } catch (e) {
    console.warn(e);
    return failPromise()
  }
}

const cache: {[url: string]: string} = {}

function getCacheKey(url: string, contentType: string | undefined) {
  let key = url.replace(/\?.*/, '')

  // font resource
  if (/ttf|otf|eot|woff2?/i.test(key)) {
    key = key.replace(/.*\//, '')
  }

  return contentType ? `[${contentType}]${key}` : key
}

const canvasTry = async(url:string)=> {
  const imgs =['png', 'jpg', 'jpeg', 'gif', 'tiff', 'svg', 'webp']
  if (imgs.some(img => url.includes(img))){
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = function () {
        if (!canvas || !ctx) {
          resolve(url)
        }
        canvas.height = img.height
        canvas.width = img.width
        ctx?.drawImage(img, 0, 0)
        resolve(canvas.toDataURL(getMimeType(img.src) || 'image/png'))
      }
      img.onerror = () => {
        resolve(url)
      }
      img.src = url
    })
  }
  return url
}
export async function resourceToDataURL(resourceUrl: string, contentType: string | undefined) {
  const cacheKey = getCacheKey(resourceUrl, contentType)

  if (cache[cacheKey] != null) {
    return cache[cacheKey]
  }

  let dataURL: string
  try {
    const content = await fetchAsDataURL(resourceUrl, ({res, result}) => {
      if (!contentType) {
        // eslint-disable-next-line no-param-reassign
        contentType = res.headers.get('Content-Type') || ''
      }
      return getContentFromDataUrl(result)
    })
    if (content.includes('http'))
      return await canvasTry(content)
    dataURL = makeDataUrl(content, contentType!)
  } catch (error) {
    dataURL = ''

    let msg = `Failed to fetch resource: ${resourceUrl}`
    if (error) {
      msg = typeof error === 'string' ? error : error.message
    }

    if (msg) {
      console.warn(msg)
    }
  }

  cache[cacheKey] = dataURL
  return dataURL
}
