/* Wrangler bundles *.wasm imports as pre-compiled WebAssembly modules
   (runtime compilation from bytes is not allowed on Workers). */
declare module "*.wasm" {
  const module: WebAssembly.Module;
  export default module;
}
declare module "satori/yoga.wasm" {
  const module: WebAssembly.Module;
  export default module;
}
declare module "@resvg/resvg-wasm/index_bg.wasm" {
  const module: WebAssembly.Module;
  export default module;
}
