import { afterEach, describe, expect, it, vi } from "vitest";
import { createH264Relay } from "../h264Relay";
const frame=(value:number,keyFrame=false)=>({id:"capture",dataUrl:null,data:new Uint8Array([value]),keyFrame,codec:"avc1.42e02a"});
afterEach(()=>vi.useRealTimers());
describe("bounded dependent frame delivery",()=>{
 it("preserves delta ordering and ignores another frame's acknowledgement",()=>{
  const send=vi.fn(),relay=createH264Relay(send);relay.offer(frame(0));expect(send).not.toHaveBeenCalled();
  relay.offer(frame(1,true));relay.offer(frame(2));relay.offer(frame(3));
  relay.acknowledge(99);expect(send).toHaveBeenCalledOnce();relay.acknowledge(1);
  expect(send.mock.lastCall![0].data[0]).toBe(2);relay.acknowledge(2);expect(send.mock.lastCall![0].data[0]).toBe(3);
 });
 it("drops a stale history and resumes only at a keyframe",()=>{
  vi.useFakeTimers();const send=vi.fn(),relay=createH264Relay(send);
  relay.offer(frame(1,true));for(let i=2;i<12;i++)relay.offer(frame(i));
  relay.acknowledge(1);expect(send).toHaveBeenCalledOnce();relay.offer(frame(12,true));
  expect(send.mock.lastCall![0].data[0]).toBe(12);
  relay.offer(frame(13));vi.advanceTimersByTime(250);relay.acknowledge(2);
  expect(send).toHaveBeenCalledTimes(2);relay.offer(frame(14));expect(send).toHaveBeenCalledTimes(2);
  relay.offer(frame(15,true));expect(send).toHaveBeenCalledTimes(3);
 });
});
