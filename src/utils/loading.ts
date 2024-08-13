export const loadingId = 'take-shot-loading'

export interface LoadingProps {
    show?: boolean
    html?: string
    color?: string
    backgroundColor?: string
    fontSize?: string
    iconSize?: string
    text?: string
    zIndex?: number
}
export const useLoading = (element: HTMLElement, props?: LoadingProps) => {
    const svg = '<svg  style="animation: spin 750ms infinite linear;font-size: 1.25rem" width="1em" height="1em" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3a9 9 0 1 0 9 9"/></svg>'
    const spinStyle = '<style>@-webkit-keyframes spin {0%{-webkit-transform: rotate(0deg);}100% {-webkit-transform: rotate(360deg);}}</style>'
    const text = `<span style=";font-size:${props?.fontSize || '0.75rem'};">${props?.text || 'taking screenshot'}</span>`
    const insertLoading = ()=>{
        if (props?.show) {
            const container = document.createElement("div")
            container.id = loadingId
            container.innerHTML = props?.html ||
                `<div style="width: 100%;height:100%;position: absolute;top: 0; inset-inline-start: 0;display: flex;flex-direction: column;justify-content: center;align-items: center;gap: 1rem;background: ${props?.backgroundColor || '#00000029'};color: ${props?.color || '#3c5de2'};z-index: ${props?.zIndex || 10};">` +
                spinStyle +
                svg +
                text +
                '</div>'
            element.appendChild(container)
        }
    }
    const removeLoading = ()=>{
        const loading = element.querySelector(`#${loadingId}`)
        loading?.remove()
    }
    return{
        insertLoading,
        removeLoading
    }
}