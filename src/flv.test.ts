import { expect } from "chai";
import { describe } from "razmin";
import * as FLV from './flv';

describe('Tag', it => {
    it('should roundtrip', () => {
        let data = Buffer.alloc(123);
        let timestamp = 92422;
        let header = new FLV.TagHeader().with({
            type: FLV.TagType.Audio,
            dataSize: data.length + 2,
            timestamp: timestamp,
            streamId: 4
        });
        let tag = new FLV.AACAudioTag().with({
            header,
            format: FLV.SoundFormat.AAC,
            rate: 3,
            size: 1,
            type: 1,
            packetType: 1,
            data
        });

        let header2 = FLV.TagHeader.deserialize(header.serialize());
        let tag2 = <FLV.AACAudioTag>FLV.Tag.deserialize(tag.serialize(), { 
            initializer: (instance: FLV.Tag) => instance.header = header 
        });

        expect(tag2 instanceof FLV.AACAudioTag).to.be.true;
        expect(tag2.header.type).to.equal(tag.header.type);
        expect(tag2.header.dataSize).to.equal(tag.header.dataSize);
        expect(tag2.header.timestamp).to.equal(tag.header.timestamp);
        expect(tag2.header.streamId).to.equal(tag.header.streamId);

        expect(tag2.format).to.equal(tag.format);
        expect(tag2.rate).to.equal(tag.rate);
        expect(tag2.size).to.equal(tag.size);
        expect(tag2.type).to.equal(tag.type);
        expect(tag2.packetType).to.equal(tag.packetType);
        expect(tag2.data.length).to.equal(tag.data.length);

        for (let i = 0, max = tag2.data.length; i < max; ++i) {
            expect(tag2.data[i]).to.equal(tag.data[i]);
        }
    })
});