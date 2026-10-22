/**
 * NEURA AI — React Native Shims & Declarations
 * Provides ambient typing for React and React Native primitives in mobile builds.
 */

declare module "react" {
  export interface ReactElement<P = any, T extends string | JSXElementConstructor<any> = string | JSXElementConstructor<any>> {
    type: T;
    props: P;
    key: string | null;
  }
  export type ComponentType<P = {}> = (props: P) => ReactElement | null;
  export type FC<P = {}> = (props: P) => ReactElement | null;
  export type ReactNode = ReactElement | string | number | boolean | null | undefined | ReactNode[];

  export function useState<T>(initialState: T | (() => T)): [T, (action: T | ((prevState: T) => T)) => void];
  export function useEffect(effect: () => void | (() => void), deps?: readonly any[]): void;
  export function useRef<T>(initialValue: T): { current: T };

  export namespace JSX {
    interface Element extends ReactElement<any, any> {}
    interface IntrinsicElements {
      [elemName: string]: any;
    }
  }
}

declare module "react-native" {
  export interface ViewStyle {
    [key: string]: any;
  }
  export interface TextStyle {
    [key: string]: any;
  }
  export interface ImageStyle {
    [key: string]: any;
  }
  export type StyleProp<T> = T | (T | null | undefined | false)[] | undefined;

  export const StyleSheet: {
    create<T extends Record<string, ViewStyle | TextStyle | ImageStyle>>(styles: T): T;
  };

  export const View: (props: any) => any;
  export const Text: (props: any) => any;
  export const TouchableOpacity: (props: any) => any;
  export const SafeAreaView: (props: any) => any;
  export const StatusBar: (props: any) => any;
  export const TextInput: (props: any) => any;
  export const ScrollView: (props: any) => any;
  export const FlatList: (props: any) => any;

  export const Linking: {
    openURL(url: string): Promise<any>;
    canOpenURL(url: string): Promise<boolean>;
  };
}
