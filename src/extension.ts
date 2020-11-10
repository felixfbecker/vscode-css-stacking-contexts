import * as vscode from 'vscode'
import * as postscss from 'postcss-scss'
import debounce from 'lodash.debounce'
import dedent from 'dedent'
import { establishesStackingContext, isIneffectiveZIndexDeclaration } from './css'
import { eol, nodeRange } from './vscode-helpers'

const DOCUMENT_SELECTOR: vscode.DocumentSelector = [{ language: 'scss' }, { language: 'css' }]
const INEFFECTIVE_Z_INDEX_CODE = 'ineffective-z-index'

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

function documentFilePath(textDocument: vscode.TextDocument): string {
    if (textDocument.uri.scheme === 'git') {
        return textDocument.uri.fsPath.replace(/\.git$/, '')
    }
    return textDocument.uri.fsPath
}

export function activate(context: vscode.ExtensionContext): void {
    const output = vscode.window.createOutputChannel('CSS Stacking Contexts')

    const diagnosticCollection = vscode.languages.createDiagnosticCollection('css-stacking-contexts')
    context.subscriptions.push(diagnosticCollection)

    const allPropertyRanges = new Map<string, vscode.Range[]>()
    const allRuleRanges = new Map<string, vscode.Range[]>()

    function decorate(editors: vscode.TextEditor[]): void {
        for (const editor of editors) {
            try {
                const propertyRanges: vscode.Range[] = []
                const ruleRanges: vscode.Range[] = []
                const diagnostics: vscode.Diagnostic[] = []

                // Parse CSS into AST
                const root = postscss.parse(editor.document.getText(), { from: editor.document.uri.fsPath })

                // Walk all CSS declarations
                root.walkDecls(declaration => {
                    if (establishesStackingContext(declaration)) {
                        propertyRanges.push(nodeRange(declaration))
                        if (declaration.parent) {
                            const parentRange = nodeRange(declaration.parent)
                            if (!ruleRanges.some(range => range.isEqual(parentRange))) {
                                ruleRanges.push(parentRange)
                            }
                        }
                    }
                    if (isIneffectiveZIndexDeclaration(declaration)) {
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
                console.error(error)
                output.append(error?.message)
            }
        }
    }
    const debouncedDecorate = debounce(decorate, 600, { maxWait: 1500 })

    // Decorate whenever documents are opened or changed
    debouncedDecorate(vscode.window.visibleTextEditors)
    context.subscriptions.push(
        vscode.window.onDidChangeVisibleTextEditors(editors => {
            debouncedDecorate(editors)
        })
    )
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor) {
                debouncedDecorate([editor])
            }
        })
    )
    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument(document => {
            console.log('onDidOpen', document.uri.toString())
            const editors = vscode.window.visibleTextEditors.filter(
                editor => documentFilePath(editor.document) === documentFilePath(document)
            )
            debouncedDecorate(editors)
        })
    )
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(event => {
            const editors = vscode.window.visibleTextEditors.filter(
                editor => documentFilePath(editor.document) === documentFilePath(event.document)
            )
            debouncedDecorate(editors)
        })
    )

    // Show more information when hovering over the hint message decoration for properties creating stacking contexts
    context.subscriptions.push(
        vscode.languages.registerHoverProvider(DOCUMENT_SELECTOR, {
            provideHover: (textDocument, position) => {
                const hoverWasAfterEol = textDocument.validateRange(
                    new vscode.Range(position, position.translate(0, 1))
                ).isEmpty
                const propertyRanges = allPropertyRanges.get(textDocument.uri.toString())
                if (!propertyRanges) {
                    return null
                }
                // Check that hover was on a line with a "This property introduces a new stacking context" decoration
                const propertyRange = propertyRanges.find(
                    range =>
                        range.contains(position) ||
                        (hoverWasAfterEol && range.start.line <= position.line && position.line <= range.end.line)
                )
                if (!propertyRange) {
                    return null
                }

                return {
                    range: propertyRange,
                    contents: [
                        new vscode.MarkdownString(
                            dedent`
                                This property introduces a new stacking context.
                                This means all \`z-index\` declarations for descendants of this element will be
                                independent of \`z-index\` declarations for other elements on the page.

                                The element itself will be positioned as one atomic unit on the z-axis inside the parent stacking context.

                                [Learn more on MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Positioning/Understanding_z_index/The_stacking_context)
                            `
                        ),
                    ],
                }
            },
        })
    )

    // Offer quick fix for ineffective z-indexes
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
                return [
                    createAddIsolationIsolateAction(diagnostic, textDocument),
                    createRemoveZIndexAction(diagnostic, textDocument),
                ]
            },
        })
    )
}

function createAddIsolationIsolateAction(
    diagnostic: vscode.Diagnostic,
    textDocument: vscode.TextDocument
): vscode.CodeAction {
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
    return isolationAction
}

function createRemoveZIndexAction(diagnostic: vscode.Diagnostic, textDocument: vscode.TextDocument): vscode.CodeAction {
    const action = new vscode.CodeAction(
        'Remove `z-index` declaration',
        vscode.CodeActionKind.QuickFix.append('removeZIndex')
    )
    action.diagnostics = [diagnostic]
    action.edit = new vscode.WorkspaceEdit()
    let removeRange = diagnostic.range
    if (textDocument.getText(new vscode.Range(diagnostic.range.end, diagnostic.range.end.translate(0, 1))) === ';') {
        removeRange = removeRange.with({ end: removeRange.end.translate(0, 1) })
    }
    // Remove indentation
    if (
        textDocument
            .getText(new vscode.Range(diagnostic.range.start.with({ character: 0 }), diagnostic.range.start))
            .trim() === ''
    ) {
        removeRange = removeRange.with({
            start: diagnostic.range.start.with({ character: 0 }),
        })
    }
    action.edit.delete(textDocument.uri, removeRange)
    return action
}
