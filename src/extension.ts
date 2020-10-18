import * as vscode from 'vscode'
import { Declaration, Node, Position, Source } from 'postcss'
import * as postscss from 'postcss-scss'
import { isDeclaration, isRuleLike } from './types'
import { debounce } from 'lodash'
import dedent from 'dedent'

const DOCUMENT_SELECTOR: vscode.DocumentSelector = [{ language: 'scss' }, { language: 'css' }]
const INEFFECTIVE_Z_INDEX_CODE = 'ineffective-z-index'

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
function establishesStackingContext(declaration: Declaration): boolean {
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

const nodeRange = (node: Node): vscode.Range => {
    if (!node.source?.start || !node.source.end) {
        throw new Error('Node has no source position')
    }
    return convertRange({ start: node.source.start, end: node.source.end })
}

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

const eol = (textDocument: vscode.TextDocument): string => (textDocument.eol === vscode.EndOfLine.LF ? '\n' : '\r\n')

export function activate(context: vscode.ExtensionContext): void {
    const output = vscode.window.createOutputChannel('CSS Stacking Contexts')
    const diagnosticCollection = vscode.languages.createDiagnosticCollection('css-stacking-contexts')
    context.subscriptions.push(diagnosticCollection)
    const allPropertyRanges = new Map<string, vscode.Range[]>()
    const allRuleRanges = new Map<string, vscode.Range[]>()
    function decorate(editors: vscode.TextEditor[]): void {
        for (const editor of editors) {
            const propertyRanges: vscode.Range[] = []
            const ruleRanges: vscode.Range[] = []
            const diagnostics: vscode.Diagnostic[] = []
            const text = editor.document.getText()
            try {
                const root = postscss.parse(text, { from: editor.document.uri.fsPath })
                root.walkDecls(declaration => {
                    if (establishesStackingContext(declaration)) {
                        propertyRanges.push(nodeRange(declaration))
                        if (declaration.parent) {
                            ruleRanges.push(nodeRange(declaration.parent))
                        }
                    } else if (
                        // z-index is specified
                        declaration.prop === 'z-index' &&
                        declaration.value !== 'auto' &&
                        !globalNeutralValues.has(declaration.value) &&
                        // but rule does not establish stacking context
                        !declaration.parent?.some(node => isDeclaration(node) && establishesStackingContext(node))
                    ) {
                        const diagnostic = new vscode.Diagnostic(
                            nodeRange(declaration),
                            'This `z-index` declaration does likely not have any effect because the rule does not create a new stacking context.',
                            vscode.DiagnosticSeverity.Warning
                        )
                        diagnostic.source = 'css-stacking-contexts'
                        diagnostic.code = {
                            target: vscode.Uri.parse(
                                'https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Positioning/Understanding_z_index/The_stacking_context',
                                true
                            ),
                            value: INEFFECTIVE_Z_INDEX_CODE,
                        }
                        diagnostic.tags = [vscode.DiagnosticTag.Unnecessary]
                        diagnostics.push(diagnostic)
                    }
                })
                editor.setDecorations(propertyInfoDecorationType, propertyRanges)
                editor.setDecorations(ruleHighlightDecorationType, ruleRanges)
                allPropertyRanges.set(editor.document.uri.toString(), propertyRanges)
                allRuleRanges.set(editor.document.uri.toString(), ruleRanges)
                diagnosticCollection.set(editor.document.uri, diagnostics)
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
    context.subscriptions.push(
        vscode.languages.registerHoverProvider(DOCUMENT_SELECTOR, {
            provideHover: (textDocument, position) => {
                const hoverWasAfterEol = !textDocument.validateRange(
                    new vscode.Range(position, position.translate(0, 1))
                ).isEmpty
                const ruleRanges = allRuleRanges.get(textDocument.uri.toString())
                if (!ruleRanges) {
                    return null
                }
                // Check that hover was on a line with a "This property introduces a new stacking context" decoration
                if (
                    !ruleRanges.some(
                        range =>
                            range.contains(position) ||
                            (hoverWasAfterEol && range.start.line <= position.line && position.line <= range.end.line)
                    )
                ) {
                    return null
                }

                return {
                    contents: [
                        new vscode.MarkdownString(
                            dedent`
                                This property introduces a new stacking context.
                                This means all \`z-index\` declarations of descendants of this element will be
                                independent of \`z-index\` declarations of other elements on the page.

                                The element itself will be positioned as one atomic unit inside the parent stacking context.

                                [Learn more on MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Positioning/Understanding_z_index/The_stacking_context)
                            `
                        ),
                    ],
                }
            },
        })
    )
    context.subscriptions.push(
        vscode.languages.registerCodeActionsProvider(DOCUMENT_SELECTOR, {
            provideCodeActions: (textDocument, range, context) => {
                const diagnostic = context.diagnostics.find(
                    diagnostic =>
                        typeof diagnostic.code === 'object' && diagnostic.code.value === INEFFECTIVE_Z_INDEX_CODE
                )
                if (!diagnostic) {
                    return null
                }
                const isolationAction = new vscode.CodeAction(
                    'Create a stacking context using `isolation: isolate`',
                    vscode.CodeActionKind.QuickFix.append('addIsolationIsolate')
                )
                isolationAction.diagnostics = [diagnostic]
                isolationAction.edit = new vscode.WorkspaceEdit()
                const indentation = textDocument.getText(
                    new vscode.Range(diagnostic.range.start.with({ character: 0 }), diagnostic.range.start)
                )
                isolationAction.edit.insert(
                    textDocument.uri,
                    diagnostic.range.start,
                    'isolation: isolate;' + eol(textDocument) + indentation
                )
                return [isolationAction]
            },
        })
    )
}
