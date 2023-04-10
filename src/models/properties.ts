export class Property {
    constructor(
        public name: string,
        public value: string,
        public group: PropertyGroup
    ) {
        // link to group
        if (group.properties.indexOf(this) < 0) {
            group.properties.push(this);
        }
    }
}

export class PropertyGroup {
    public properties: Property[];
    constructor(
        public name: string
    ) {
        this.properties = [];
    }
}
