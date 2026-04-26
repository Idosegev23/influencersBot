declare module '*.glb';
declare module '*.png';

declare module 'meshline' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const MeshLineGeometry: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const MeshLineMaterial: any;
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      meshLineGeometry: any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      meshLineMaterial: any;
    }
  }
}

// React 19 / Next.js 16 use React.JSX for component-level intrinsics
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      meshLineGeometry: any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      meshLineMaterial: any;
    }
  }
}

export {};
