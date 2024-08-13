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
  process: (data: {result: string; res: any}) => T
): Promise<T> {
  const failPromise =(uri?:string)=>  new Promise<T>((resolve) => {
    resolve((uri || url) as T)
  })
  try {
    const res = await fetch(url,{
      credentials: 'include',
      headers:{
        origin: window.location.origin,
        host: window.location.host,
        mode: 'no-cors',
        'Access-Control-Allow-Origin': '*',
        Connection: 'keep-alive',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Credentials': 'true',
        "Content-Type": "application/octet-stream"
      },
    })
    if (res.status === 404) {
      return failPromise('')
    }
    const blob = await res.blob()
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

const getPlaceholder = async(url:string, placeholder?: string)=> {
  const imgs =['png', 'jpg', 'jpeg', 'gif', 'tiff', 'svg', 'webp']
  if (imgs.some(img => url.includes(img)) && placeholder){
    return placeholder
  }
  return url
}
export async function resourceToDataURL(resourceUrl: string, contentType: string | undefined, placeholder?: string) {
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
      return await getPlaceholder(content, placeholder);
    dataURL = makeDataUrl(content, contentType!)
  } catch (error) {
    dataURL = ''

    let msg = `Failed to fetch resource: ${resourceUrl}`
    if (error) {
      msg = typeof error === 'string' ? error : error.message
    }

    if (msg) {
      console.warn(msg, 'error on get')
    }
  }

  cache[cacheKey] = dataURL
  return dataURL
}
