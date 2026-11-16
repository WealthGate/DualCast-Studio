import { describe, expect, it } from "vitest";
import { createH264Parser, h264CaptureArgs } from "../h264Capture";

const aud = [0,0,0,1,9,0xf0];
describe("hardware capture bitstream", () => {
  it("assembles split access units and supplies the actual SPS codec", () => {
    const frames: {key:boolean;codec?:string}[]=[];
    const parser=createH264Parser((_data,key,codec)=>frames.push({key,codec}));
    const input=Buffer.from([...aud,0,0,1,0x67,0x42,0xe0,0x2a,0,0,1,0x65,1,2,...aud,0,0,1,0x41,3,4,...aud]);
    for(let i=0;i<input.length;i+=3) parser.push(input.subarray(i,i+3));
    expect(frames).toEqual([{key:true,codec:"avc1.42e02a"},{key:false,codec:"avc1.42e02a"}]);
  });
  it("can present a final still-window access unit without another repaint", () => {
    const frames: Buffer[]=[];const parser=createH264Parser(data=>frames.push(data));
    parser.push(Buffer.from([...aud,0,0,1,0x65,1])); expect(frames).toHaveLength(0);
    parser.flush(); expect(frames).toHaveLength(1);
  });
  it("uses no B-frames, short recovery GOPs and low-latency hardware options", () => {
    const args=h264CaptureArgs("h264_qsv",60);
    expect(args).toEqual(expect.arrayContaining(["-async_depth","1","-bf","0","-g","30"]));
    expect(args).not.toContain("mjpeg");
  });
});
