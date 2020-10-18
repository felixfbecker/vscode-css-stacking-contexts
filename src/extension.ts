import * as vscode from 'vscode'
import { Declaration, Position, Source } from 'postcss'
import * as postscss from 'postcss-scss'
import { isDeclaration, isRuleLike } from './types'
import { debounce } from 'lodash'

const globalNeutralValues = new Set<string>(['unset', 'initial', 'inherit', 'revert'])
const stackingContextEstablishingProperties = new Set<string>([
    'clip-path',
    'contain',
    'filter',
    'isolation',
    'mask-border',
    'mask-image',
    'mask',
    'mix-blend-mode',
    'opacity',
    'perspective',
    'position',
    'transform',
    'webkit-overflow-scrolling',
    'z-index',
])
const flexAndGridChildProperties = new Set<string>([
    'flex',
    'flex-grow',
    'flex-shrink',
    'flex-basis',
    'grid-column-start',
    'grid-column-end',
    'grid-row-start',
    'grid-row-end',
    'grid-column',
    'grid-row',
    'align-self',
    'justify-self',
    'place-self',
    'order',
])

// https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Positioning/Understanding_z_index/The_stacking_context
export function establishesStackingContext(declaration: Declaration): boolean {
    return (
        stackingContextEstablishingProperties.has(declaration.prop) &&
        !globalNeutralValues.has(declaration.value) &&
        ((declaration.prop === 'z-index' &&
            declaration.value !== 'auto' &&
            isRuleLike(declaration.parent) &&
            declaration.parent.some(
                child =>
                    isDeclaration(child) &&
                    ((child.prop === 'position' && (child.value === 'absolute' || child.value === 'relative')) ||
                        // If the rule has any flex/grid child properties, it is likely the child of a flex or grid element.
                        flexAndGridChildProperties.has(child.prop))
            )) ||
            (declaration.prop === 'position' && (declaration.value === 'fixed' || declaration.value === 'sticky')) ||
            (declaration.prop === 'opacity' && declaration.value !== '1') ||
            (declaration.prop === 'mix-blend-mode' && declaration.value !== 'normal') ||
            (declaration.prop === 'transform' && declaration.value !== 'none') ||
            (declaration.prop === 'filter' && declaration.value !== 'none') ||
            (declaration.prop === 'perspective' && declaration.value !== 'none') ||
            (declaration.prop === 'clip-path' && declaration.value !== 'none') ||
            (declaration.prop === 'mask' && declaration.value !== 'none') ||
            (declaration.prop === 'mask-image' && declaration.value !== 'none') ||
            (declaration.prop === 'mask-border' && declaration.value !== 'none') ||
            (declaration.prop === 'isolation' && declaration.value === 'isolate') ||
            (declaration.prop === '-webkit-overflow-scrolling' && declaration.value === 'touch') ||
            (declaration.prop === 'contain' &&
                (declaration.value === 'layout' ||
                    declaration.value === 'paint' ||
                    declaration.value === 'strict' ||
                    declaration.value === 'content')) ||
            (declaration.prop === 'will-change' &&
                declaration.value
                    .split(',')
                    .some(property => stackingContextEstablishingProperties.has(property.trim()))))
    )
}

const convertPosition = (position: Position): vscode.Position =>
    new vscode.Position(position.line - 1, position.column - 1)
const convertRange = (source: Pick<Required<Source>, 'start' | 'end'>): vscode.Range =>
    new vscode.Range(convertPosition(source.start), convertPosition(source.end))

const propertyInfoDecorationType = vscode.window.createTextEditorDecorationType({
    after: {
        color: new vscode.ThemeColor('editorInfo.foreground'),
        contentText: ' ⓘ This property creates a new stacking context',
    },
    isWholeLine: true,
})

const ruleHighlightDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor('editor.hoverHighlightBackground'),
    isWholeLine: true,
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedOpen,
})

export function activate(context: vscode.ExtensionContext): void {
    const output = vscode.window.createOutputChannel('CSS Stacking Contexts')
    function decorate(editors: vscode.TextEditor[]): void {
        for (const editor of editors) {
            const text = editor.document.getText()
            try {
                const root = postscss.parse(text, { from: editor.document.uri.fsPath })
                const propertyRanges: vscode.Range[] = []
                const ruleRanges: vscode.Range[] = []
                root.walkDecls(declaration => {
                    if (establishesStackingContext(declaration)) {
                        if (declaration.source?.start && declaration.source.end) {
                            propertyRanges.push(
                                convertRange({ start: declaration.source.start, end: declaration.source.end })
                            )
                        }
                        if (declaration.parent?.source?.start && declaration.parent.source.end) {
                            ruleRanges.push(
                                convertRange({
                                    start: declaration.parent.source.start,
                                    end: declaration.parent.source.end,
                                })
                            )
                        }
                    }
                })
                editor.setDecorations(propertyInfoDecorationType, propertyRanges)
                editor.setDecorations(ruleHighlightDecorationType, ruleRanges)
            } catch (error) {
                output.append(error?.message)
            }
        }
    }
    const debouncedDecorate = debounce(decorate, 300, { maxWait: 400 })

    debouncedDecorate(vscode.window.visibleTextEditors)
    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument(document => {
            const editors = vscode.window.visibleTextEditors.filter(editor => editor.document === document)
            debouncedDecorate(editors)
        })
    )
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(event => {
            const editors = vscode.window.visibleTextEditors.filter(editor => editor.document === event.document)
            debouncedDecorate(editors)
        })
    )
}
