declare const tokenizer: Tokenizer

interface Options {
    from?: string
}
export type Token = [
    type: 'ident' | 'word',
    text: string,
    // 1-based
    startLine: number,
    startCharacter: number,
    endLine: number,
    endCharacter: number
]
interface Tokenizer {
    tokenize(css: string, options?: Options): Token[]
}
export default tokenizer
