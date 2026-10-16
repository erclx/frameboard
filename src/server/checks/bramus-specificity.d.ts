// The package ships its types beside a package.json whose `exports` names
// none, so bundler resolution cannot reach them. This states the one call the
// cascade makes.
declare module '@bramus/specificity' {
  export default class Specificity {
    static calculate(selector: string): Specificity[]
    toArray(): [number, number, number]
  }
}
