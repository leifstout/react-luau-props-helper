import * as vscode from "vscode";

// Built-in defaults; these match the package.json default.
// They are used if the user has no config, or if a class isn't in the config.
const defaultPropsMap: Record<string, string[]> = {
  TextLabel: [
    "Text",
    "TextColor3",
    "TextTransparency",
    "TextStrokeColor3",
    "TextStrokeTransparency",
    "Font",
    "TextSize",
    "RichText",
    "TextWrapped",
    "TextXAlignment",
    "TextYAlignment",
    "BackgroundColor3",
    "BackgroundTransparency",
    "BorderSizePixel",
    "BorderColor3",
    "Size",
    "Position",
    "AnchorPoint",
    "Visible",
    "ZIndex",
    "LayoutOrder",
  ],
  Frame: [
    "BackgroundColor3",
    "BackgroundTransparency",
    "BorderSizePixel",
    "BorderColor3",
    "Size",
    "Position",
    "AnchorPoint",
    "Visible",
    "ZIndex",
    "LayoutOrder",
    "AutomaticSize",
  ],
  ImageLabel: [
    "Image",
    "ImageColor3",
    "ImageTransparency",
    "ScaleType",
    "SliceCenter",
    "BackgroundColor3",
    "BackgroundTransparency",
    "BorderSizePixel",
    "BorderColor3",
    "Size",
    "Position",
    "AnchorPoint",
    "Visible",
    "ZIndex",
    "LayoutOrder",
  ],
};

export function activate(context: vscode.ExtensionContext) {
  const selector: vscode.DocumentSelector = [
    { language: "lua", scheme: "file" },
    { language: "luau", scheme: "file" },
  ];

  const provider = vscode.languages.registerCompletionItemProvider(
    selector,
    new ReactLuauPropsCompletionProvider(),
    " ",
    "\n"
  );

  context.subscriptions.push(provider);
}

export function deactivate() {}

class ReactLuauPropsCompletionProvider
  implements vscode.CompletionItemProvider
{
  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.ProviderResult<vscode.CompletionItem[]> {
    // Text from start of document to cursor
    const range = new vscode.Range(new vscode.Position(0, 0), position);
    let textBeforeCursor = document.getText(range);

    // Limit size for performance
    const maxLookback = 2000;
    if (textBeforeCursor.length > maxLookback) {
      textBeforeCursor = textBeforeCursor.slice(
        textBeforeCursor.length - maxLookback
      );
    }

    const className = this.getEnclosingClassName(textBeforeCursor);
    if (!className) {
      return undefined;
    }

    // Only suggest if we actually have props for this class
    const props = this.getPropsForClass(className);
    if (!props || props.length === 0) {
      return undefined;
    }

    if (!this.isInsidePropsObject(textBeforeCursor, className)) {
      return undefined;
    }

    return this.buildItemsForProps(className, props);
  }

  /**
   * Find the last call before the cursor that looks like:
   *   React.createElement("ClassName", {
   *   e("ClassName", {
   *
   * Returns the ClassName or undefined.
   */
  private getEnclosingClassName(text: string): string | undefined {
    const pattern =
      /(React\.createElement|e)\s*\(\s*(?:(["'])([A-Za-z0-9_]+)\2|([A-Za-z0-9_]+))\s*,\s*{/g;

    let match: RegExpExecArray | null;
    let lastClassName: string | undefined = undefined;

    while ((match = pattern.exec(text)) !== null) {
      const fromString = match[3]; // "TextLabel"
      const fromIdent = match[4]; // TextLabel
      const className = fromString || fromIdent;
      if (className) {
        lastClassName = className;
      }
    }

    return lastClassName;
  }

  /**
   * Check if the cursor is still inside the props object for the last
   * React.createElement/e("ClassName", { ... }) call.
   *
   * We:
   *   - find the last matching call for this className
   *   - start at the '{' and track brace depth
   *   - if we hit depth 0 again before cursor → we've closed the object
   */
  private isInsidePropsObject(text: string, className: string): boolean {
    const pattern =
      /(React\.createElement|e)\s*\(\s*(?:(["'])([A-Za-z0-9_]+)\2|([A-Za-z0-9_]+))\s*,\s*{/g;

    let match: RegExpExecArray | null;
    let propsStartIndex = -1;

    while ((match = pattern.exec(text)) !== null) {
      const fromString = match[3];
      const fromIdent = match[4];
      const matchedClassName = fromString || fromIdent;

      if (matchedClassName !== className) continue;

      const braceIndexInMatch = match[0].lastIndexOf("{");
      propsStartIndex = match.index + braceIndexInMatch;
    }

    if (propsStartIndex === -1) {
      return false;
    }

    let depth = 0;
    let ended = false;

    for (let i = propsStartIndex; i < text.length; i++) {
      const ch = text[i];

      if (ch === "{") {
        depth++;
      } else if (ch === "}") {
        depth--;
        if (depth === 0 && i > propsStartIndex) {
          ended = true;
          break;
        }
      }
    }

    // Not ended yet → still inside props object
    return !ended;
  }

  /**
   * Get props for a given class name, using:
   *   1) user configuration if present
   *   2) built-in defaults otherwise
   */
  private getPropsForClass(className: string): string[] | undefined {
    const config = vscode.workspace.getConfiguration("reactLuauPropsHelper");

    const userMap =
      config.get<Record<string, string[]>>("props", defaultPropsMap) ||
      defaultPropsMap;

    return userMap[className] || defaultPropsMap[className];
  }

  /**
   * Build completion items with `Name = ` insertion.
   */
  private buildItemsForProps(
    className: string,
    props: string[]
  ): vscode.CompletionItem[] {
    return props.map((name) => {
      const item = new vscode.CompletionItem(
        name,
        vscode.CompletionItemKind.Property
      );
      item.insertText = new vscode.SnippetString(`${name} = $0`);
      item.detail = `${className} property (React Luau helper)`;
      return item;
    });
  }
}
