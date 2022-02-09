import { BitstreamElement, BitstreamReader, BitstreamWriter, DefaultVariant, Field, FieldDefinition, Marker, Reserved, Serializer, Variant, VariantMarker } from "@astronautlabs/bitstream";
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
    *read(reader: BitstreamReader, type: any, parent: BitstreamElement, field: FieldDefinition): Generator<number, any, unknown> {
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

export class Body extends BitstreamElement {
    @Field(8*4) private previousTagSize0 : number;
    @Field(0, { serializer: new FLVBodySerializer() }) tags : Tag[];
}

export enum TagType {
    Audio = 8,
    Video = 9,
    ScriptObject = 18
}

export class Tag extends BitstreamElement {
    @Field(8) type : number;
    @Field(8*3) dataSize : number;
    @Field(8*3) timestamp : number;
    @Field(8) timestampExtended : number;
    @Field(8*3) streamId : number = 0;
    @Field(8*4) lookbackPointer : number;

    @Marker() $dataStart;
    @VariantMarker() $variant;
    @Marker() $dataEnd;
    
    @Field((i : AudioTag) => i.dataSize - i.measure(i => i.$dataStart, i => i.$dataEnd))
    data : Uint8Array;
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

@Variant((i : Tag) => i.type === TagType.Audio)
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
export class AACAudioTag extends Tag {
    @Field(8) packetType : number;
}

@Variant((i : Tag) => i.type === TagType.Video)
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

@Variant((i : Tag) => i.type === TagType.ScriptObject)
export class DataObjectTag extends Tag {
    @Field(0, { 
        array: { 
            type: DataObject, 
            hasMore: (i : DataObjectTag) => i.objects[i.objects.length - 1].data instanceof AMF0.ObjectEndValue
        } 
    })
    objects : DataObject[];
}
