/**
 * @license Copyright (c) 2003-2019, CKSource - Frederico Knabben. All rights reserved.
 * For licensing, see LICENSE.md or https://ckeditor.com/legal/ckeditor-oss-license
 */

/**
 * @module restricted-editing/restrictedediting
 */

import Plugin from '@ckeditor/ckeditor5-core/src/plugin';
import Matcher from '@ckeditor/ckeditor5-engine/src/view/matcher';

/**
 * @extends module:core/plugin~Plugin
 */
export default class RestrictedEditing extends Plugin {
	/**
	 * @inheritDoc
	 */
	static get pluginName() {
		return 'RestrictedEditing';
	}

	/**
	 * @inheritDoc
	 */
	constructor( editor ) {
		super( editor );

		this._alwaysEnabled = new Set( [ 'undo', 'redo' ] );
	}

	/**
	 * @inheritDoc
	 */
	init() {
		const editor = this.editor;

		let createdMarkers = 0;

		editor.conversion.for( 'upcast' ).add( upcastHighlightToMarker( {
			view: {
				name: 'span',
				classes: 'ck-restricted-editing-exception'
			},
			model: () => {
				createdMarkers++;

				return `restricted-editing-exception:${ createdMarkers }`;
			}
		} ) );

		editor.conversion.for( 'downcast' ).markerToHighlight( {
			model: 'restricted-editing-exception',
			// Use callback to return new object every time new marker instance is created - otherwise it will be seen as the same marker.
			view: () => ( {
				name: 'span',
				classes: 'ck-restricted-editing-exception',
				priority: -10
			} )
		} );

		this._disableCommands( editor );

		const selection = editor.model.document.selection;
		this.listenTo( selection, 'change', () => {
			const marker = Array.from( editor.model.markers.getMarkersAtPosition( selection.focus ) )
				.find( marker => marker.name.startsWith( 'restricted-editing-exception:' ) );

			if ( !marker ) {
				this._disableCommands( editor );

				return;
			}

			this._enableCommands( editor );
		} );
	}

	_enableCommands( editor ) {
		const commands = this._getCommandsToToggle( editor );

		for ( const command of commands ) {
			command.clearForceDisabled( 'RestrictedMode' );
		}
	}

	_disableCommands( editor ) {
		const names = Array.from( editor.commands.names() ).filter( name => !this._alwaysEnabled.has( name ) );
		const commands = names.map( name => editor.commands.get( name ) );

		for ( const command of commands ) {
			command.forceDisabled( 'RestrictedMode' );
		}
	}

	_getCommandsToToggle( editor ) {
		return Array.from( editor.commands.names() )
			.filter( name => !this._alwaysEnabled.has( name ) )
			.map( name => editor.commands.get( name ) );
	}
}

function upcastHighlightToMarker( config ) {
	return dispatcher => dispatcher.on( 'element:span', ( evt, data, conversionApi ) => {
		const { writer } = conversionApi;

		const matcher = new Matcher( config.view );
		const matcherResult = matcher.match( data.viewItem );

		// If there is no match, this callback should not do anything.
		if ( !matcherResult ) {
			return;
		}

		const match = matcherResult.match;

		// Force consuming element's name (taken from upcast helpers elementToElement converter).
		match.name = true;

		const { modelRange: convertedChildrenRange } = conversionApi.convertChildren( data.viewItem, data.modelCursor );
		conversionApi.consumable.consume( data.viewItem, match );

		const markerName = config.model( data.viewItem );
		const fakeMarkerStart = writer.createElement( '$marker', { 'data-name': markerName } );
		const fakeMarkerEnd = writer.createElement( '$marker', { 'data-name': markerName } );

		// Insert in reverse order to use converter content positions directly (without recalculating).
		writer.insert( fakeMarkerEnd, convertedChildrenRange.end );
		writer.insert( fakeMarkerStart, convertedChildrenRange.start );

		data.modelRange = writer.createRange(
			writer.createPositionBefore( fakeMarkerStart ),
			writer.createPositionAfter( fakeMarkerEnd )
		);
		data.modelCursor = data.modelRange.end;
	} );
}
