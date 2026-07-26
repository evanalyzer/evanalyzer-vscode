import { window } from "./vscode-mock";

/** Matches the wizard's own label for its fast-forward choice. */
const FAST_FORWARD_LABEL = "$(check-all) Done - fill everything else with defaults";

interface FakeInputBoxHandlers {
  change: Array<(value: string) => void>;
  button: Array<() => void>;
  accept: Array<() => void>;
  hide: Array<() => void>;
}

function makeInputBox(onShow: (box: { value: string }, handlers: FakeInputBoxHandlers) => void) {
  const handlers: FakeInputBoxHandlers = { change: [], button: [], accept: [], hide: [] };
  const box = {
    value: "",
    prompt: "",
    ignoreFocusOut: false,
    buttons: [] as unknown[],
    validationMessage: undefined as string | undefined,
    onDidChangeValue: (cb: (value: string) => void) => handlers.change.push(cb),
    onDidTriggerButton: (cb: () => void) => handlers.button.push(cb),
    onDidAccept: (cb: () => void) => handlers.accept.push(cb),
    onDidHide: (cb: () => void) => handlers.hide.push(cb),
    show: () => onShow(box, handlers),
    dispose: () => {},
  };
  return box;
}

/** Queues the next text/number prompt to be answered by typing `value` and pressing Enter. */
export function mockAcceptInput(value: string): void {
  window.createInputBox.mockImplementationOnce(() =>
    makeInputBox((box, handlers) => {
      box.value = value;
      handlers.change.forEach((h) => h(value));
      handlers.accept.forEach((h) => h());
    })
  );
}

/** Queues the next text/number prompt to be cancelled (Esc / close without accepting). */
export function mockCancelInput(): void {
  window.createInputBox.mockImplementationOnce(() =>
    makeInputBox((_box, handlers) => {
      handlers.hide.forEach((h) => h());
    })
  );
}

/** Queues the next text/number prompt to be answered via the "fill everything else with defaults" button. */
export function mockFastForwardInput(): void {
  window.createInputBox.mockImplementationOnce(() =>
    makeInputBox((_box, handlers) => {
      handlers.button.forEach((h) => h());
    })
  );
}

interface QuickPickItemLike {
  label: string;
}

/** Queues the next QuickPick to be answered by selecting the item with this exact label. */
export function mockPickLabel(label: string): void {
  window.showQuickPick.mockImplementationOnce(async (itemsOrPromise: QuickPickItemLike[] | Promise<QuickPickItemLike[]>) => {
    const items = await itemsOrPromise;
    return items.find((item) => item.label === label);
  });
}

/** Queues the next QuickPick to be cancelled (Esc). */
export function mockCancelPick(): void {
  window.showQuickPick.mockResolvedValueOnce(undefined);
}

/** Queues the next QuickPick to be answered via its "fill everything else with defaults" item. */
export function mockFastForwardPick(): void {
  window.showQuickPick.mockImplementationOnce(async (itemsOrPromise: QuickPickItemLike[] | Promise<QuickPickItemLike[]>) => {
    const items = await itemsOrPromise;
    return items.find((item) => item.label === FAST_FORWARD_LABEL);
  });
}

/**
 * Fills every remaining QuickPick/InputBox prompt with fast-forward, for
 * tests that don't care about the exact number of remaining prompts (the
 * count varies by command/schema shape and isn't the point of the test).
 */
export function mockFastForwardEverythingElse(): void {
  window.showQuickPick.mockImplementation(async (itemsOrPromise: QuickPickItemLike[] | Promise<QuickPickItemLike[]>) => {
    const items = await itemsOrPromise;
    return items.find((item) => item.label === FAST_FORWARD_LABEL);
  });
  window.createInputBox.mockImplementation(() =>
    makeInputBox((_box, handlers) => {
      handlers.button.forEach((h) => h());
    })
  );
}
