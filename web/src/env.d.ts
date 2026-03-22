/// <reference types="@rsbuild/core/types" />

interface ImportMetaEnv {
  /** 例：`http://127.0.0.1:8000`，用于开发时直连后端 API */
  readonly PUBLIC_API_BASE?: string;
}

/**
 * Imports the SVG file as a React component.
 * @requires [@rsbuild/plugin-svgr](https://npmjs.com/package/@rsbuild/plugin-svgr)
 */
declare module '*.svg?react' {
  import type React from 'react';
  const ReactComponent: React.FunctionComponent<React.SVGProps<SVGSVGElement>>;
  export default ReactComponent;
}
