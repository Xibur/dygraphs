/**
 * @license
 * Copyright 2011 Robert Konigsberg (konigsberg@google.com)
 * MIT-licensed (http://opensource.org/licenses/MIT)
 */

/**
 * @fileoverview The default interaction model for Dygraphs. This is kept out
 * of dygraph.js for better navigability.
 * @author Robert Konigsberg (konigsberg@google.com)
 */

/*jshint globalstrict: true */
/*global Dygraph:false */
"use strict";

/**
 * A collection of functions to facilitate build custom interaction models.
 * @class
 */
Dygraph.Interaction = {};

/**
 * Called in response to an interaction model operation that
 * should start the default panning behavior.
 *
 * It's used in the default callback for "mousedown" operations.
 * Custom interaction model builders can use it to provide the default
 * panning behavior.
 *
 * @param { Event } event the event object which led to the startPan call.
 * @param { Dygraph} g The dygraph on which to act.
 * @param { Object} context The dragging context object (with
 * dragStartX/dragStartY/etc. properties). This function modifies the context.
 */
Dygraph.Interaction.startPan = function(event, g, context) {
  var i, axis;
  context.isPanning = true;
  var xRange = g.xAxisRange();
  context.dateRange = xRange[1] - xRange[0];
  context.initialLeftmostDate = xRange[0];
  context.xUnitsPerPixel = context.dateRange / (g.plotter_.area.w - 1);

  if (g.attr_("panEdgeFraction")) {
    var maxXPixelsToDraw = g.width_ * g.attr_("panEdgeFraction");
    var xExtremes = g.xAxisExtremes(); // I REALLY WANT TO CALL THIS xTremes!

    var boundedLeftX = g.toDomXCoord(xExtremes[0]) - maxXPixelsToDraw;
    var boundedRightX = g.toDomXCoord(xExtremes[1]) + maxXPixelsToDraw;

    var boundedLeftDate = g.toDataXCoord(boundedLeftX);
    var boundedRightDate = g.toDataXCoord(boundedRightX);
    context.boundedDates = [boundedLeftDate, boundedRightDate];

    var boundedValues = [];
    var maxYPixelsToDraw = g.height_ * g.attr_("panEdgeFraction");

    for (i = 0; i < g.axes_.length; i++) {
      axis = g.axes_[i];
      var yExtremes = axis.extremeRange;

      var boundedTopY = g.toDomYCoord(yExtremes[0], i) + maxYPixelsToDraw;
      var boundedBottomY = g.toDomYCoord(yExtremes[1], i) - maxYPixelsToDraw;

      var boundedTopValue = g.toDataYCoord(boundedTopY);
      var boundedBottomValue = g.toDataYCoord(boundedBottomY);

      boundedValues[i] = [boundedTopValue, boundedBottomValue];
    }
    context.boundedValues = boundedValues;
  }

  // Record the range of each y-axis at the start of the drag.
  // If any axis has a valueRange or valueWindow, then we want a 2D pan.
  // We can't store data directly in g.axes_, because it does not belong to us
  // and could change out from under us during a pan (say if there's a data
  // update).
  context.is2DPan = false;
  context.axes = [];
  for (i = 0; i < g.axes_.length; i++) {
    axis = g.axes_[i];
    var axis_data = {};
    var yRange = g.yAxisRange(i);
    // TODO(konigsberg): These values should be in |context|.
    // In log scale, initialTopValue, dragValueRange and unitsPerPixel are log scale.
    if (axis.logscale) {
      axis_data.initialTopValue = Dygraph.log10(yRange[1]);
      axis_data.dragValueRange = Dygraph.log10(yRange[1]) - Dygraph.log10(yRange[0]);
    } else {
      axis_data.initialTopValue = yRange[1];
      axis_data.dragValueRange = yRange[1] - yRange[0];
    }
    axis_data.unitsPerPixel = axis_data.dragValueRange / (g.plotter_.area.h - 1);
    context.axes.push(axis_data);

    // While calculating axes, set 2dpan.
    if (axis.valueWindow || axis.valueRange) context.is2DPan = true;
  }
};

/**
 * Called in response to an interaction model operation that
 * responds to an event that pans the view.
 *
 * It's used in the default callback for "mousemove" operations.
 * Custom interaction model builders can use it to provide the default
 * panning behavior.
 *
 * @param { Event } event the event object which led to the movePan call.
 * @param { Dygraph} g The dygraph on which to act.
 * @param { Object} context The dragging context object (with
 * dragStartX/dragStartY/etc. properties). This function modifies the context.
 */
Dygraph.Interaction.movePan = function(event, g, context) {
  context.dragEndX = g.dragGetX_(event, context);
  context.dragEndY = g.dragGetY_(event, context);

  var minDate = context.initialLeftmostDate -
    (context.dragEndX - context.dragStartX) * context.xUnitsPerPixel;
  if (context.boundedDates) {
    minDate = Math.max(minDate, context.boundedDates[0]);
  }
  var maxDate = minDate + context.dateRange;
  if (context.boundedDates) {
    if (maxDate > context.boundedDates[1]) {
      // Adjust minDate, and recompute maxDate.
      minDate = minDate - (maxDate - context.boundedDates[1]);
      maxDate = minDate + context.dateRange;
    }
  }

  g.dateWindow_ = [minDate, maxDate];

  // y-axis scaling is automatic unless this is a full 2D pan.
  if (context.is2DPan) {
    // Adjust each axis appropriately.
    for (var i = 0; i < g.axes_.length; i++) {
      var axis = g.axes_[i];
      var axis_data = context.axes[i];

      var pixelsDragged = context.dragEndY - context.dragStartY;
      var unitsDragged = pixelsDragged * axis_data.unitsPerPixel;

      var boundedValue = context.boundedValues ? context.boundedValues[i] : null;

      // In log scale, maxValue and minValue are the logs of those values.
      var maxValue = axis_data.initialTopValue + unitsDragged;
      if (boundedValue) {
        maxValue = Math.min(maxValue, boundedValue[1]);
      }
      var minValue = maxValue - axis_data.dragValueRange;
      if (boundedValue) {
        if (minValue < boundedValue[0]) {
          // Adjust maxValue, and recompute minValue.
          maxValue = maxValue - (minValue - boundedValue[0]);
          minValue = maxValue - axis_data.dragValueRange;
        }
      }
      if (axis.logscale) {
        axis.valueWindow = [ Math.pow(Dygraph.LOG_SCALE, minValue),
                             Math.pow(Dygraph.LOG_SCALE, maxValue) ];
      } else {
        axis.valueWindow = [ minValue, maxValue ];
      }
    }
  }

  g.drawGraph_(false);
};

/**
 * Called in response to an interaction model operation that
 * responds to an event that ends panning.
 *
 * It's used in the default callback for "mouseup" operations.
 * Custom interaction model builders can use it to provide the default
 * panning behavior.
 *
 * @param { Event } event the event object which led to the endPan call.
 * @param { Dygraph} g The dygraph on which to act.
 * @param { Object} context The dragging context object (with
 * dragStartX/dragStartY/etc. properties). This function modifies the context.
 */
Dygraph.Interaction.endPan = function(event, g, context) {
  context.dragEndX = g.dragGetX_(event, context);
  context.dragEndY = g.dragGetY_(event, context);

  var regionWidth = Math.abs(context.dragEndX - context.dragStartX);
  var regionHeight = Math.abs(context.dragEndY - context.dragStartY);

  if (regionWidth < 2 && regionHeight < 2 &&
      g.lastx_ !== undefined && g.lastx_ != -1) {
    Dygraph.Interaction.treatMouseOpAsClick(g, event, context);
  }

  // TODO(konigsberg): mouseup should just delete the
  // context object, and mousedown should create a new one.
  context.isPanning = false;
  context.is2DPan = false;
  context.initialLeftmostDate = null;
  context.dateRange = null;
  context.valueRange = null;
  context.boundedDates = null;
  context.boundedValues = null;
  context.axes = null;
};

/**
 * Called in response to an interaction model operation that
 * responds to an event that starts zooming.
 *
 * It's used in the default callback for "mousedown" operations.
 * Custom interaction model builders can use it to provide the default
 * zooming behavior.
 *
 * @param { Event } event the event object which led to the startZoom call.
 * @param { Dygraph} g The dygraph on which to act.
 * @param { Object} context The dragging context object (with
 * dragStartX/dragStartY/etc. properties). This function modifies the context.
 */
Dygraph.Interaction.startZoom = function(event, g, context) {
  context.isZooming = true;
};

/**
 * Called in response to an interaction model operation that
 * responds to an event that defines zoom boundaries.
 *
 * It's used in the default callback for "mousemove" operations.
 * Custom interaction model builders can use it to provide the default
 * zooming behavior.
 *
 * @param { Event } event the event object which led to the moveZoom call.
 * @param { Dygraph} g The dygraph on which to act.
 * @param { Object} context The dragging context object (with
 * dragStartX/dragStartY/etc. properties). This function modifies the context.
 */
Dygraph.Interaction.moveZoom = function(event, g, context) {
  context.dragEndX = g.dragGetX_(event, context);
  context.dragEndY = g.dragGetY_(event, context);

  var xDelta = Math.abs(context.dragStartX - context.dragEndX);
  var yDelta = Math.abs(context.dragStartY - context.dragEndY);

  // drag direction threshold for y axis is twice as large as x axis
  context.dragDirection = (xDelta < yDelta / 2) ? Dygraph.VERTICAL : Dygraph.HORIZONTAL;

  g.drawZoomRect_(
      context.dragDirection,
      context.dragStartX,
      context.dragEndX,
      context.dragStartY,
      context.dragEndY,
      context.prevDragDirection,
      context.prevEndX,
      context.prevEndY);

  context.prevEndX = context.dragEndX;
  context.prevEndY = context.dragEndY;
  context.prevDragDirection = context.dragDirection;
};

Dygraph.Interaction.treatMouseOpAsClick = function(g, event, context) {
  var clickCallback = g.attr_('clickCallback');
  var pointClickCallback = g.attr_('pointClickCallback');

  var selectedPoint = null;

  // Find out if the click occurs on a point. This only matters if there's a pointClickCallback.
  if (pointClickCallback) {
    var closestIdx = -1;
    var closestDistance = Number.MAX_VALUE;

    // check if the click was on a particular point.
    for (var i = 0; i < g.selPoints_.length; i++) {
      var p = g.selPoints_[i];
      var distance = Math.pow(p.canvasx - context.dragEndX, 2) +
                     Math.pow(p.canvasy - context.dragEndY, 2);
      if (!isNaN(distance) &&
          (closestIdx == -1 || distance < closestDistance)) {
        closestDistance = distance;
        closestIdx = i;
      }
    }

    // Allow any click within two pixels of the dot.
    var radius = g.attr_('highlightCircleSize') + 2;
    if (closestDistance <= radius * radius) {
      selectedPoint = g.selPoints_[closestIdx];
    }
  }

  if (selectedPoint) {
    pointClickCallback(event, selectedPoint);
  }

  // TODO(danvk): pass along more info about the points, e.g. 'x'
  if (clickCallback) {
    clickCallback(event, g.lastx_, g.selPoints_);
  }
};

/**
 * Called in response to an interaction model operation that
 * responds to an event that performs a zoom based on previously defined
 * bounds..
 *
 * It's used in the default callback for "mouseup" operations.
 * Custom interaction model builders can use it to provide the default
 * zooming behavior.
 *
 * @param { Event } event the event object which led to the endZoom call.
 * @param { Dygraph} g The dygraph on which to end the zoom.
 * @param { Object} context The dragging context object (with
 * dragStartX/dragStartY/etc. properties). This function modifies the context.
 */
Dygraph.Interaction.endZoom = function(event, g, context) {
  context.isZooming = false;
  context.dragEndX = g.dragGetX_(event, context);
  context.dragEndY = g.dragGetY_(event, context);
  var regionWidth = Math.abs(context.dragEndX - context.dragStartX);
  var regionHeight = Math.abs(context.dragEndY - context.dragStartY);

  if (regionWidth < 2 && regionHeight < 2 &&
      g.lastx_ !== undefined && g.lastx_ != -1) {
    Dygraph.Interaction.treatMouseOpAsClick(g, event, context);
  }

  if (regionWidth >= 10 && context.dragDirection == Dygraph.HORIZONTAL) {
    g.doZoomX_(Math.min(context.dragStartX, context.dragEndX),
               Math.max(context.dragStartX, context.dragEndX));
    context.cancelNextDblclick = true;
  } else if (regionHeight >= 10 && context.dragDirection == Dygraph.VERTICAL) {
    g.doZoomY_(Math.min(context.dragStartY, context.dragEndY),
               Math.max(context.dragStartY, context.dragEndY));
    context.cancelNextDblclick = true;
  } else {
    g.clearZoomRect_();
  }
  context.dragStartX = null;
  context.dragStartY = null;
};

/**
 * @private
 */
Dygraph.Interaction.startTouch = function(event, g, context) {
  event.preventDefault();  // touch browsers are all nice.
  var touches = [];
  for (var i = 0; i < event.touches.length; i++) {
    var t = event.touches[i];
    // we dispense with 'dragGetX_' because all touchBrowsers support pageX
    touches.push({
      pageX: t.pageX,
      pageY: t.pageY,
      dataX: g.toDataXCoord(t.pageX),
      dataY: g.toDataYCoord(t.pageY)
      // identifier: t.identifier
    });
  }
  context.initialTouches = touches;

  if (touches.length == 1) {
    // This is just a swipe.
    context.initialPinchCenter = touches[0];
    context.touchDirections = { x: true, y: true };
  } else if (touches.length == 2) {
    // It's become a pinch!

    // only screen coordinates can be averaged (data coords could be log scale).
    context.initialPinchCenter = {
      pageX: 0.5 * (touches[0].pageX + touches[1].pageX),
      pageY: 0.5 * (touches[0].pageY + touches[1].pageY),

      // TODO(danvk): remove
      dataX: 0.5 * (touches[0].dataX + touches[1].dataX),
      dataY: 0.5 * (touches[0].dataY + touches[1].dataY)
    };

    // Make pinches in a 45-degree swath around either axis 1-dimensional zooms.
    var initialAngle = 180 / Math.PI * Math.atan2(
        context.initialPinchCenter.pageY - touches[0].pageY,
        touches[0].pageX - context.initialPinchCenter.pageX);

    // use symmetry to get it into the first quadrant.
    initialAngle = Math.abs(initialAngle);
    if (initialAngle > 90) initialAngle = 90 - initialAngle;

    context.touchDirections = {
      x: (initialAngle < (90 - 45/2)),
      y: (initialAngle > 45/2)
    };
  }

  // save the full x & y ranges.
  context.initialRange = {
    x: g.xAxisRange(),
    y: g.yAxisRange()
  };
};

/**
 * @private
 */
Dygraph.Interaction.moveTouch = function(event, g, context) {
  var i, touches = [];
  for (i = 0; i < event.touches.length; i++) {
    var t = event.touches[i];
    touches.push({
      pageX: t.pageX,
      pageY: t.pageY
    });
  }
  var initialTouches = context.initialTouches;

  var c_now;

  // old and new centers.
  var c_init = context.initialPinchCenter;
  if (touches.length == 1) {
    c_now = touches[0];
  } else {
    c_now = {
      pageX: 0.5 * (touches[0].pageX + touches[1].pageX),
      pageY: 0.5 * (touches[0].pageY + touches[1].pageY)
    };
  }

  // this is the "swipe" component
  // we toss it out for now, but could use it in the future.
  var swipe = {
    pageX: c_now.pageX - c_init.pageX,
    pageY: c_now.pageY - c_init.pageY
  };
  var dataWidth = context.initialRange.x[1] - context.initialRange.x[0];
  var dataHeight = context.initialRange.y[0] - context.initialRange.y[1];
  swipe.dataX = (swipe.pageX / g.plotter_.area.w) * dataWidth;
  swipe.dataY = (swipe.pageY / g.plotter_.area.h) * dataHeight;
  var xScale, yScale;

  // The residual bits are usually split into scale & rotate bits, but we split
  // them into x-scale and y-scale bits.
  if (touches.length == 1) {
    xScale = 1.0;
    yScale = 1.0;
  } else if (touches.length == 2) {
    var initHalfWidth = (initialTouches[1].pageX - c_init.pageX);
    xScale = (touches[1].pageX - c_now.pageX) / initHalfWidth;

    var initHalfHeight = (initialTouches[1].pageY - c_init.pageY);
    yScale = (touches[1].pageY - c_now.pageY) / initHalfHeight;
  }

  // Clip scaling to [1/8, 8] to prevent too much blowup.
  xScale = Math.min(8, Math.max(0.125, xScale));
  yScale = Math.min(8, Math.max(0.125, yScale));

  if (context.touchDirections.x) {
    g.dateWindow_ = [
      c_init.dataX - swipe.dataX + (context.initialRange.x[0] - c_init.dataX) / xScale,
      c_init.dataX - swipe.dataX + (context.initialRange.x[1] - c_init.dataX) / xScale
    ];
  }
  
  if (context.touchDirections.y) {
    for (i = 0; i < 1  /*g.axes_.length*/; i++) {
      var axis = g.axes_[i];
      if (axis.logscale) {
        // TODO(danvk): implement
      } else {
        axis.valueWindow = [
          c_init.dataY - swipe.dataY + (context.initialRange.y[0] - c_init.dataY) / yScale,
          c_init.dataY - swipe.dataY + (context.initialRange.y[1] - c_init.dataY) / yScale
        ];
      }
    }
  }

  g.drawGraph_(false);
};

/**
 * @private
 */
Dygraph.Interaction.endTouch = function(event, g, context) {
  if (event.touches.length != 0) {
    // this is effectively a "reset"
    Dygraph.Interaction.startTouch(event, g, context);
  }
};

/**
 * Default interation model for dygraphs. You can refer to specific elements of
 * this when constructing your own interaction model, e.g.:
 * g.updateOptions( {
 *   interactionModel: {
 *     mousedown: Dygraph.defaultInteractionModel.mousedown
 *   }
 * } );
 */
Dygraph.Interaction.defaultModel = {
  // Track the beginning of drag events
  mousedown: function(event, g, context) {
    // Right-click should not initiate a zoom.
    if (event.button && event.button == 2) return;

    context.initializeMouseDown(event, g, context);

    if (event.altKey || event.shiftKey) {
      Dygraph.startPan(event, g, context);
    } else {
      Dygraph.startZoom(event, g, context);
    }
  },

  // Draw zoom rectangles when the mouse is down and the user moves around
  mousemove: function(event, g, context) {
    if (context.isZooming) {
      Dygraph.moveZoom(event, g, context);
    } else if (context.isPanning) {
      Dygraph.movePan(event, g, context);
    }
  },

  mouseup: function(event, g, context) {
    if (context.isZooming) {
      Dygraph.endZoom(event, g, context);
    } else if (context.isPanning) {
      Dygraph.endPan(event, g, context);
    }
  },

  touchstart: function(event, g, context) {
    Dygraph.Interaction.startTouch(event, g, context);
  },
  touchmove: function(event, g, context) {
    Dygraph.Interaction.moveTouch(event, g, context);
  },
  touchend: function(event, g, context) {
    Dygraph.Interaction.endTouch(event, g, context);
  },

  // Temporarily cancel the dragging event when the mouse leaves the graph
  mouseout: function(event, g, context) {
    if (context.isZooming) {
      context.dragEndX = null;
      context.dragEndY = null;
    }
  },

  // Disable zooming out if panning.
  dblclick: function(event, g, context) {
    if (context.cancelNextDblclick) {
      context.cancelNextDblclick = false;
      return;
    }
    if (event.altKey || event.shiftKey) {
      return;
    }
    // TODO(konigsberg): replace g.doUnzoom()_ with something that is
    // friendlier to public use.
    g.doUnzoom_();
  }
};

Dygraph.DEFAULT_ATTRS.interactionModel = Dygraph.Interaction.defaultModel;

// old ways of accessing these methods/properties
Dygraph.defaultInteractionModel = Dygraph.Interaction.defaultModel;
Dygraph.endZoom = Dygraph.Interaction.endZoom;
Dygraph.moveZoom = Dygraph.Interaction.moveZoom;
Dygraph.startZoom = Dygraph.Interaction.startZoom;
Dygraph.endPan = Dygraph.Interaction.endPan;
Dygraph.movePan = Dygraph.Interaction.movePan;
Dygraph.startPan = Dygraph.Interaction.startPan;

Dygraph.Interaction.nonInteractiveModel_ = {
  mousedown: function(event, g, context) {
    context.initializeMouseDown(event, g, context);
  },
  mouseup: function(event, g, context) {
    // TODO(danvk): this logic is repeated in Dygraph.Interaction.endZoom
    context.dragEndX = g.dragGetX_(event, context);
    context.dragEndY = g.dragGetY_(event, context);
    var regionWidth = Math.abs(context.dragEndX - context.dragStartX);
    var regionHeight = Math.abs(context.dragEndY - context.dragStartY);

    if (regionWidth < 2 && regionHeight < 2 &&
        g.lastx_ !== undefined && g.lastx_ != -1) {
      Dygraph.Interaction.treatMouseOpAsClick(g, event, context);
    }
  }
};

// Default interaction model when using the range selector.
Dygraph.Interaction.dragIsPanInteractionModel = {
  mousedown: function(event, g, context) {
    context.initializeMouseDown(event, g, context);
    Dygraph.startPan(event, g, context);
  },
  mousemove: function(event, g, context) {
    if (context.isPanning) {
      Dygraph.movePan(event, g, context);
    }
  },
  mouseup: function(event, g, context) {
    if (context.isPanning) {
      Dygraph.endPan(event, g, context);
    }
  }
};
