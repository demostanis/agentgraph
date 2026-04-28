export type InputHandlers = {
  pointerDown: (event: PointerEvent) => void;
  pointerMove: (event: PointerEvent) => void;
  pointerUp: (event: PointerEvent) => void;
  pointerLeave: () => void;
  wheel: (event: WheelEvent) => void;
};

export class InputController {
  constructor(
    private readonly element: HTMLElement,
    private readonly handlers: InputHandlers,
  ) {
    this.element.addEventListener("pointerdown", this.handlers.pointerDown);
    this.element.addEventListener("pointermove", this.handlers.pointerMove);
    this.element.addEventListener("pointerup", this.handlers.pointerUp);
    this.element.addEventListener("pointercancel", this.handlers.pointerUp);
    this.element.addEventListener("pointerleave", this.handlers.pointerLeave);
    this.element.addEventListener("wheel", this.handlers.wheel, { passive: false });
  }

  dispose(): void {
    this.element.removeEventListener("pointerdown", this.handlers.pointerDown);
    this.element.removeEventListener("pointermove", this.handlers.pointerMove);
    this.element.removeEventListener("pointerup", this.handlers.pointerUp);
    this.element.removeEventListener("pointercancel", this.handlers.pointerUp);
    this.element.removeEventListener("pointerleave", this.handlers.pointerLeave);
    this.element.removeEventListener("wheel", this.handlers.wheel);
  }
}
