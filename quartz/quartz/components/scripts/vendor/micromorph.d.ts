// micromorph ships this declaration but omits it from its package exports.
declare module "micromorph" {
  export default function micromorph(from: Node, to: Node): Promise<void>
}
