import Foundation
import AppKit
import ApplicationServices
import CoreGraphics

func output(_ object: [String: Any]) {
  let data = try! JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
  print(String(data: data, encoding: .utf8)!)
}
func fail(_ message: String) -> Never { output(["error": message]); exit(1) }
let display = CGMainDisplayID()
let bounds = CGDisplayBounds(display)
let command = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "status"
if command == "status" {
  output(["accessibility": AXIsProcessTrusted(), "screenRecording": CGPreflightScreenCaptureAccess(),
    "display": ["width": Int(bounds.width), "height": Int(bounds.height), "x": Int(bounds.origin.x), "y": Int(bounds.origin.y)],
    "frontmostApp": NSWorkspace.shared.frontmostApplication?.bundleIdentifier ?? ""])
  exit(0)
}
if !AXIsProcessTrusted() { fail("ACCESSIBILITY_PERMISSION_REQUIRED") }
let payload = CommandLine.arguments.count > 2 ? CommandLine.arguments[2] : "{}"
guard let data = payload.data(using: .utf8), let action = try? JSONSerialization.jsonObject(with: data) as? [String:Any] else { fail("INVALID_ACTION_JSON") }
let type = action["type"] as? String ?? ""
func number(_ name:String) -> Double { (action[name] as? NSNumber)?.doubleValue ?? 0 }
let point = CGPoint(x:number("x"), y:number("y"))
func mouse(_ kind: CGEventType, at point:CGPoint, button:CGMouseButton = .left, count:Int64 = 1) {
  guard let e = CGEvent(mouseEventSource:nil, mouseType:kind, mouseCursorPosition:point, mouseButton:button) else { return }
  e.setIntegerValueField(.mouseEventClickState, value:count);e.post(tap:.cghidEventTap)
}
let keycodes:[String:CGKeyCode] = ["a":0,"s":1,"d":2,"f":3,"h":4,"g":5,"z":6,"x":7,"c":8,"v":9,"b":11,"q":12,"w":13,"e":14,"r":15,"y":16,"t":17,"1":18,"2":19,"3":20,"4":21,"6":22,"5":23,"=":24,"9":25,"7":26,"-":27,"8":28,"0":29,"]":30,"o":31,"u":32,"[":33,"i":34,"p":35,"enter":36,"return":36,"l":37,"j":38,"'":39,"k":40,";":41,"\\":42,",":43,"/":44,"n":45,"m":46,".":47,"tab":48,"space":49,"backspace":51,"delete":51,"escape":53,"esc":53,"left":123,"right":124,"down":125,"up":126,"home":115,"end":119,"pageup":116,"pagedown":121,"f1":122,"f2":120,"f3":99,"f4":118,"f5":96,"f6":97,"f7":98,"f8":100,"f9":101,"f10":109,"f11":103,"f12":111]
switch type {
case "click", "double_click", "right_click":
  let right = type == "right_click"
  let repetitions = type == "double_click" ? 2 : 1
  for i in 1...repetitions {
    mouse(right ? .rightMouseDown : .leftMouseDown, at:point, button:right ? .right : .left, count:Int64(i));usleep(60000)
    mouse(right ? .rightMouseUp : .leftMouseUp, at:point, button:right ? .right : .left, count:Int64(i));usleep(80000)
  }
case "drag":
  let end = CGPoint(x:number("x2"),y:number("y2"));mouse(.leftMouseDown,at:point)
  for i in 1...20 { let k=Double(i)/20;mouse(.leftMouseDragged,at:CGPoint(x:point.x+(end.x-point.x)*k,y:point.y+(end.y-point.y)*k));usleep(20000) }
  mouse(.leftMouseUp,at:end)
case "type":
  let text = action["text"] as? String ?? ""
  let chars = Array(text.utf16)
  for start in stride(from:0,to:chars.count,by:100) {
    let chunk=Array(chars[start..<min(start+100,chars.count)])
    for down in [true,false] {
      let e=CGEvent(keyboardEventSource:nil,virtualKey:0,keyDown:down)!
      chunk.withUnsafeBufferPointer{e.keyboardSetUnicodeString(stringLength:chunk.count,unicodeString:$0.baseAddress!)}
      e.post(tap:.cghidEventTap)
    };usleep(12000)
  }
case "key":
  let parts=(action["key"] as? String ?? "").lowercased().split(separator:"+").map(String.init)
  guard let last=parts.last,let code=keycodes[last] else { fail("UNSUPPORTED_KEY") }
  var flags:CGEventFlags=[]
  for mod in parts.dropLast() {
    switch mod { case "cmd","command","meta":flags.insert(.maskCommand);case "ctrl","control":flags.insert(.maskControl);case "alt","option":flags.insert(.maskAlternate);case "shift":flags.insert(.maskShift);default:fail("UNSUPPORTED_MODIFIER") }
  }
  for down in [true,false] {let e=CGEvent(keyboardEventSource:nil,virtualKey:code,keyDown:down)!;e.flags=flags;e.post(tap:.cghidEventTap);usleep(50000)}
case "scroll":
  mouse(.mouseMoved,at:point)
  let dy = -Int32(number("dy"))
  CGEvent(scrollWheelEvent2Source:nil,units:.line,wheelCount:1,wheel1:dy,wheel2:0,wheel3:0)?.post(tap:.cghidEventTap)
default:fail("UNSUPPORTED_ACTION")
}
output(["ok":true,"type":type])
