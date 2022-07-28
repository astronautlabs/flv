import { BitstreamElement, BitstreamReader, BitstreamWriter, DefaultVariant, Field, FieldDefinition, IncompleteReadResult, Marker, Reserved, Serializer, Variant, VariantMarker } from "@astronautlabs/bitstream";
import { AMF0 } from '@astronautlabs/amf';

export class Header extends BitstreamElement {
    @Field(3, { string: { encoding: 'ascii' } }) 
    signature : 'FLV' = 'FLV';

    @Field(8) version : number;
    @Reserved(5) $reserved1 : number;
    @Field(1) audio : boolean;
    @Reserved(1) $reserved2 : number;
    @Field(1) video : boolean;
    @Field(8*4) dataOffset : number;

    @VariantMarker() $variant;
    @Marker() $remainder;

    @Field((i : DefaultHeader) => 8*(i.dataOffset - i.measureTo(i => i.$remainder)))
    data : Uint8Array;
}

@DefaultVariant()
export class DefaultHeader extends Header {
}


export class FLVBodySerializer implements Serializer {
    *read(reader: BitstreamReader, type: any, parent: BitstreamElement, field: FieldDefinition): Generator<IncompleteReadResult, any, unknown> {
        let values : Tag[] = [];
        while (true) {
            let result = Tag.read(reader).next();
            if (result.done === false)
                return values;
            values.push(result.value);
        }
    }

    write(writer: BitstreamWriter, type: any, parent: BitstreamElement, field: FieldDefinition, value: Tag[]) {
        value.forEach(v => v.write(writer));
    }
}

export class TagHeader extends BitstreamElement {
    @Field(8) type : number;
    @Field(8*3) dataSize : number;
    @Field(8*3) basicTimestamp : number;
    @Field(8) timestampExtended : number;
    
    get timestamp() {
        return this.timestampExtended << 24 | this.basicTimestamp;
    }

    set timestamp(value) {
        this.timestampExtended = value >> 24;
        this.basicTimestamp = value & 0x00FFFFFF;
    }

    @Field(8*3) streamId : number = 0;
}

/**
 * Represents an FLV tag without its header. Because the FLV tag needs to know how large it is, it is
 * the responsibility of the container to provide `header` using an initializer.
 * An FLV file or raw FLV stream consists of BodyTags, which in turn contain these Tags. 
 * RTMP skips the FLV headers, instead synthesizing them from the underlying RTMP headers.
 */
export class Tag extends BitstreamElement {
    header: TagHeader;

    @Marker() $dataStart;
    @VariantMarker() $variant;
    @Marker() $dataEnd;
    
    @Field((i : AudioTag) => i.header ? i.header.dataSize * 8 - i.bitsRead : 0, { buffer: { truncate: false }})
    data : Uint8Array;

    onVariationFrom(source: Tag) {
        // Make sure we carry our header into variants
        this.header = source.header;
    }
}

export class BodyTag extends BitstreamElement {
    @Field(8*4) lookbackLength: number;
    @Field(0) header: TagHeader;
    @Field(0, { initializer: (tag: Tag, container: BodyTag) => tag.header = container.header }) tag: Tag;
}

export class Body extends BitstreamElement {
    @Field(0, { array: { type: BodyTag }, serializer: new FLVBodySerializer() }) tags : BodyTag[];
    @Field(8*4) lastLookbackLength: number;
}

export enum TagType {
    Audio = 8,
    Video = 9,
    ScriptObject = 18
}

export enum SoundFormat {
    LinearPCMPE = 0,
    ADPCM = 1,
    MP3 = 2,
    LinearPCMLE = 3,
    Nellymoser16kHz = 4,
    Nellymoser8kHz = 5,
    Nellymoser = 6,
    G711A = 7,
    G711mu = 8,
    AAC = 10,
    Speex = 11,
    MP38kHz = 14,
    DeviceSpecific = 15
}

@Variant((i : Tag) => i.header.type === TagType.Audio)
export class AudioTag extends Tag {
    @Field(4) format : number;
    @Field(2) rate : number;
    @Field(1) size : number;
    @Field(1) type : number;
}

export enum AACPacketType {
    SequenceHeader = 0,
    Raw = 1
}

@Variant((i : AudioTag) => i.format === SoundFormat.AAC)
export class AACAudioTag extends AudioTag {
    @Field(8) packetType : number;
}

@Variant((i: AACAudioTag) => i.packetType === 0)
export class AACSequenceHeaderTag extends AACAudioTag {
}

@Variant((i: AACAudioTag) => i.packetType === 1)
export class AACAudioFrameTag extends AACAudioTag {}

@Variant((i : Tag) => i.header.type === TagType.Video)
export class VideoTag extends Tag {
    @Field(4) frameType : number;
    @Field(4) codec : number;
}

export enum VideoCodec {
    JPEG = 1,
    H263 = 2,
    Screen = 3,
    VP6 = 4,
    VP6Alpha = 5,
    Screen2 = 6,
    AVC = 7
}

export enum AudioCodec {
    LinearPCM = 0,
    ADPCM = 1,
    MP3 = 2,
    LinearPCMLE = 3,
    Nellymoser16kHz = 4,
    Nellymoser8kHz = 5,
    Nellymoser = 6,
    G711A = 7,
    G711mu = 8,
    Reserved = 9,
    AAC = 10,
    Speex = 11,
    MP38kHz = 14,
    DeviceSpecific = 15
}

export enum AVCPacketType {
    SequenceHeader = 0,
    NALU = 1,
    EndOfSequence = 2
}

@Variant((i : VideoTag) => i.codec === VideoCodec.AVC)
export class AVCVideoTag extends VideoTag {
    @Field(8) packetType : number;
    @Field(8*3, { number: { format: 'signed' }}) compositionTime : number;
}

export class AVCDecoderConfigurationRecord extends BitstreamElement {
}

@Variant((i : AVCVideoTag) => i.packetType === AVCPacketType.SequenceHeader)
export class AVCSequenceHeaderTag extends AVCVideoTag {
    @Field() decoderConfiguration : AVCDecoderConfigurationRecord;
}

export class DataObject extends BitstreamElement {
    @Field(16, { writtenValue: i => i.name.length }) private nameLength : number;
    @Field(i => i.nameLength) private $name : string;

    get name() {
        return this.$name;
    }

    set name(value) {
        this.$name = value;
        this.nameLength = value?.length;
    }

    @Field() data : AMF0.Value;
}

@Variant((i : Tag) => i.header.type === TagType.ScriptObject)
export class DataObjectTag extends Tag {
    @Field(0, { 
        array: { 
            type: DataObject, 
            hasMore: (i : DataObjectTag) => i.objects[i.objects.length - 1].data instanceof AMF0.ObjectEndValue
        } 
    })
    objects : DataObject[];
}
