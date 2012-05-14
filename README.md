# Adobe InDesign extension script for MOO

## Hello!

If you're a MOO customer who uses Adobe InDesign, you may find this
extension script useful. It allows you to create MiniCards, Business
Cards and Postcards and upload them to MOO, all from within InDesign.

## Compatibility

The script has been tested with CS5, CS5.5 and CS6. Earlier versions will not work (yet).

It has been tested on Mac OS X 10.6 and Windows 7. Your mileage may vary with other OS versions.

### Windows note

You may see a message about being unable to load a type library. This
is a bug in the Windows version of InDesign, and can be worked around
by quitting and re-running InDesign as Administrator (just once will
do -- you can run it as a normal user once it starts working).

## Installation

* Download [moo.jsx](https://raw.github.com/moodev/moo-indesign/master/moo.jsx)
* Copy it to the right place
   * Mac: `/Applications/Adobe InDesign CS5/Scripts/startup scripts`
   * Windows: `\Program Files\Adobe\InDesign CS5\Scripts\startup scripts`
   * In either case, change `CS5` to `CS5.5` or `CS6` if you have a newer version.
* Start InDesign
* There should be a MOO menu!

## Usage

The MOO menu should be fairly self-explanatory. It allows you to

* create a new product (MiniCard, Business Card or Post Card)
* add an _image_ side (i.e. the _back_ of the card, where an image would typically go)
* add a _details_ side (i.e. the _front_ of the card, where your details would typically go)
* change whether the current side is _details_ or _image_
* send your finished design to MOO, where you can check it over before adding it your cart.

A normal MOO pack of cards would typically have one details side and
many image sides, but using this extension you can create any number
of each, and the MOO site will do the right thing. Give it a go!
