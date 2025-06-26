export type DecodeBytesParamResult = {
  decoded: DecodeRecursiveResult;
};

export type DecodeTupleParamResult =
  | {
      name: string;
      baseType: string;
      type: string;
      rawValue: any;
      value: DecodeParamTypesResult;
    }[]
  | null;

export type DecodeArrayParamResult =
  | {
      name: string;
      baseType: string;
      type: string;
      rawValue: any;
      value: DecodeParamTypesResult;
    }[];

export type DecodeParamTypesResult =
  | string
  | DecodeBytesParamResult
  | DecodeTupleParamResult
  | DecodeArrayParamResult;

export type Arg = {
  name: string;
  baseType: string;
  type: string;
  rawValue: any;
  value: DecodeParamTypesResult;
};

export type DecodeRecursiveResult = {
  functionName: string;
  signature: string;
  rawArgs: any;
  args: Arg[];
} | null;

export type HighlightedText = {
  text: string;
  isHighlighted: boolean;
  isCurrentResult: boolean;
};

export type HighlightedContent = string | HighlightedText[];

export interface SourceCode {
  sources: Record<string, { content: string }>;
}

export interface ContractResult {
  SourceCode: string;
  ContractName: string;
  ABI: string;
  Implementation: string;
}

export interface ContractResponse {
  status: string;
  message: string;
  result: ContractResult[];
}

export interface EVMParameter {
  type: string;
  name?: string;
  components?: EVMParameter[];
}
