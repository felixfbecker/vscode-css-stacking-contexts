import * as vscode from 'vscode'
// import { Observable } from 'rxjs'

// const fromVsCodeEvent = <T>(event: vscode.Event<T>): Observable<T> =>
//     new Observable<T>(observer => {
//         const disposable = event(observer.next.bind(observer))
//         return () => disposable.dispose()
//     })

const stackingContextEstablishingProperties = new Set<string>([
    'clipPath',
    'contain',
    'filter',
    'isolation',
    'mask',
    'maskBorder',
    'maskImage',
    'mixBlendMode',
    'opacity',
    'perspective',
    'position',
    'transform',
    'webkitOverflowScrolling',
    'zIndex',
])

// export function establishesStackingContext(property: string, value: string): boolean {
//     // https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Positioning/Understanding_z_index/The_stacking_context
//     return !!(
//         ((styles.position === 'absolute' || styles.position === 'relative') && styles.zIndex !== 'auto') ||
//         styles.position === 'fixed' ||
//         styles.position === 'sticky' ||
//         (parentStyles &&
//             (parentStyles.display === 'flex' || parentStyles.display === 'grid') &&
//             styles.zIndex !== 'auto') ||
//         parseFloat(styles.opacity) !== 1 ||
//         styles.mixBlendMode !== 'normal' ||
//         styles.transform !== 'none' ||
//         styles.filter !== 'none' ||
//         styles.perspective !== 'none' ||
//         styles.clipPath !== 'none' ||
//         styles.mask !== 'none' ||
//         styles.maskImage !== 'none' ||
//         styles.maskBorder !== 'none' ||
//         styles.isolation === 'isolate' ||
//         styles.webkitOverflowScrolling === 'touch' ||
//         styles.contain === 'layout' ||
//         styles.contain === 'paint' ||
//         styles.contain === 'strict' ||
//         styles.contain === 'content' ||
//         (styles.willChange &&
//             styles.willChange.split(',').some(property => stackingContextEstablishingProperties.has(property.trim())))
//     )
// }

const CANDIDATE_REGEX = /(?<!\/\*.*)\bposition:\s*(sticky|fixed)\b|\bz-index:\s*(?!auto|initial|inherit|unset)\b|\bcontain:\s*(layout|paint|strict|content)\b|\bisolation:\s*isolate|\b((mask(-image|-border)?)|transform|filter|perspective|clip-path):\s*(?!none|initial|inherit|unset)\b|\bmix-blend-mode:\s*(?!normal|initial|inherit|unset)\b|\b-webkit-overflow-scrolling:\s*touch\b|\bwill-change:[^;}]*\b(clip-path|contain|filter|isolation|mask|mask-border|mask-image|mix-blend-mode|opacity|perspective|position|transform|webkit-overflow-scrolling|z-index)\b/g

const decorationType = vscode.window.createTextEditorDecorationType({
    after: {
        color: new vscode.ThemeColor('editorInfo.foreground'),
        contentText: ' ⓘ This property introduces a new stacking context',
    },
    isWholeLine: true,
})

function decorate(editors: vscode.TextEditor[]): void {
    for (const editor of editors) {
        const text = editor.document.getText()
        const ranges: vscode.Range[] = []
        for (const match of text.matchAll(CANDIDATE_REGEX)) {
            ranges.push(
                new vscode.Range(
                    editor.document.positionAt(match.index!),
                    editor.document.positionAt(match.index! + match[0].length)
                )
            )
        }
        console.log('setting decorations', editor, ranges)
        editor.setDecorations(decorationType, ranges)
    }
}

export function activate(context: vscode.ExtensionContext): void {
    console.log('ACTIVATED')
    decorate(vscode.window.visibleTextEditors)
    vscode.workspace.onDidOpenTextDocument(document => {
        const editors = vscode.window.visibleTextEditors.filter(editor => editor.document === document)
        decorate(editors)
    })
    vscode.workspace.onDidChangeTextDocument(event => {
        const editors = vscode.window.visibleTextEditors.filter(editor => editor.document === event.document)
        decorate(editors)
    })
}
